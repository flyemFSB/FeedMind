import CryptoJS from "crypto-js";
import { gunzipSync } from "node:zlib";
import { db, cookieCloud, cookieStore } from "@feedmind/db";
import { eq } from "drizzle-orm";
import { encryptValue, decryptValue } from "@feedmind/shared";
import type { CookieCloudRow, CookieStoreRow } from "@feedmind/db";
import type { PlatformId } from "@feedmind/contracts";
import { logger } from "../../lib/logger.js";

// CookieCloud cookie 域名到平台的映射
const DOMAIN_TO_PLATFORM: Record<string, PlatformId> = {
  ".bilibili.com": "bilibili",
  ".douyin.com": "douyin",
  ".xiaohongshu.com": "xiaohongshu",
  ".zhihu.com": "zhihu",
  ".feishu.cn": "feishu",
  ".weread.qq.com": "weread",
};

function matchPlatform(domain: string): PlatformId | null {
  const d = domain.toLowerCase();
  for (const [prefix, platform] of Object.entries(DOMAIN_TO_PLATFORM)) {
    if (d === prefix || d.endsWith(prefix)) return platform;
    const bare = prefix.replace(/^\./, "");
    if (d === bare || d.endsWith("." + bare)) return platform;
  }
  return null;
}

// 保存 UUID + 密码配置（密码 Fernet 加密落库，与 model apiKey 同策略）
export async function saveConfig(
  uuid: string,
  password: string,
  cryptoType: string = "legacy",
): Promise<void> {
  await db
    .insert(cookieCloud)
    .values({ uuid, password: encryptValue(password), encrypted: "", cryptoType })
    .onConflictDoUpdate({
      target: cookieCloud.uuid,
      set: { password: encryptValue(password), cryptoType },
    });
}

// 存储加密数据并自动解密写入 cookie_store。
// body 可能为 gzip 压缩（CookieCloud 扩展对大数据自动压缩），先解压再解密。
export async function storeEncrypted(
  uuid: string,
  encrypted: string,
  cryptoType: string,
): Promise<void> {
  let payload = encrypted;
  try {
    // 扩展上传 gzip 压缩的 base64 密文时，先解压回原始密文
    payload = gunzipSync(Buffer.from(encrypted, "base64")).toString("utf8");
  } catch {
    // 非 gzip 数据（普通 base64 密文），保持原样
  }

  const config = await db.select().from(cookieCloud).where(eq(cookieCloud.uuid, uuid)).get();
  if (!config) {
    await db
      .insert(cookieCloud)
      .values({ uuid, password: "", encrypted: payload, cryptoType })
      .onConflictDoUpdate({ target: cookieCloud.uuid, set: { encrypted: payload } });
    return;
  }

  await db.update(cookieCloud).set({ encrypted: payload }).where(eq(cookieCloud.uuid, uuid));

  if (config.password) {
    try {
      const password = decryptValue(config.password);
      const data = decrypt(uuid, payload, password, cryptoType) as Record<string, unknown>;
      await syncCookies(uuid, data);
    } catch (err) {
      logger.error({ err, uuid }, "CookieCloud 数据解密失败");
    }
  }
}

export async function getConfig(uuid: string): Promise<CookieCloudRow | null> {
  const row = await db.select().from(cookieCloud).where(eq(cookieCloud.uuid, uuid)).get();
  return row ?? null;
}

/** 同平台多来源 Cookie 拼接优先级：CookieCloud（浏览器实时同步，最新）> 手动。
 * 拼接串中同名 Cookie 后者覆盖前者，故按此排序保证取最新来源的值。 */
const SOURCE_RANK: Record<string, number> = { manual: 1 };

export function joinCookies(rows: { uuid: string; cookies: string }[]): string {
  return [...rows]
    .sort((a, b) => (SOURCE_RANK[a.uuid] ?? 0) - (SOURCE_RANK[b.uuid] ?? 0))
    .map((r) => r.cookies)
    .join("; ");
}

export async function getCookies(platform: string): Promise<CookieStoreRow[]> {
  return db.select().from(cookieStore).where(eq(cookieStore.platform, platform)).all();
}

export async function getAllCookies(): Promise<CookieStoreRow[]> {
  return db.select().from(cookieStore).all();
}

/**
 * 校验指定平台 Cookie 登录态（纯 HTTP，不创建浏览器窗口），并把结果写回 cookie_store。
 * 各平台用自身轻量鉴权接口判断；接口不可用/网络异常时按"未知"处理不落库。
 */
export async function checkPlatformCookie(platform: string): Promise<{
  valid: boolean | null;
  checkedAt: string | null;
  supported: boolean;
}> {
  const rows = await db.select().from(cookieStore).where(eq(cookieStore.platform, platform)).all();
  if (rows.length === 0) return { valid: null, checkedAt: null, supported: false };

  const cookies = joinCookies(rows);
  let valid: boolean | null;
  try {
    valid = await checkCookieHttp(platform, cookies);
  } catch {
    // 网络波动/风控等无法判定登录态：按"未知"处理，不落库，避免误报失效引导用户重登
    valid = null;
  }
  const checkedAt = new Date().toISOString();

  if (valid !== null) {
    await db
      .update(cookieStore)
      .set({ valid, checkedAt })
      .where(eq(cookieStore.platform, platform));
  }
  return { valid, checkedAt, supported: valid !== null };
}

// 各平台登录态探测：返回 true=有效 / false=失效 / null=该平台不支持 HTTP 校验
async function checkCookieHttp(platform: string, cookies: string): Promise<boolean | null> {
  const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";
  const h = { "User-Agent": UA, Cookie: cookies };

  switch (platform) {
    case "bilibili": {
      const r = await fetch("https://api.bilibili.com/x/web-interface/nav", { headers: h });
      const o = (await r.json()) as { code?: number };
      return o.code === 0;
    }
    case "zhihu": {
      const r = await fetch("https://www.zhihu.com/api/v4/me", { headers: h });
      return r.status === 200;
    }
    case "weread": {
      const r = await fetch("https://weread.qq.com/web/shelf/sync?synckey=0&teenmode=0&album=1", {
        headers: h,
      });
      const o = (await r.json()) as { errCode?: number };
      // -2010 为登录态失效；其余错误（含 -2041 上下文错误）不代表 cookie 无效
      return o.errCode !== -2010;
    }
    default:
      // douyin/xiaohongshu 无可靠轻量鉴权接口，返回 null 表示不支持
      return null;
  }
}

// 保存手动输入的 cookie（账号 Cookie）
export async function saveManualCookies(platform: string, cookies: string): Promise<void> {
  const uuid = "manual";
  await db
    .insert(cookieStore)
    .values({ uuid, platform, cookies })
    .onConflictDoUpdate({
      target: [cookieStore.uuid, cookieStore.platform],
      set: { cookies },
    });
}

// 严格对齐 CryptoJS 行为以保证兼容性；
// CookieCloud 如果改算法这里需要同步更新。
export function decrypt(
  uuid: string,
  encrypted: string,
  password: string,
  cryptoType: string = "legacy",
): unknown {
  const hash = CryptoJS.MD5(uuid + "-" + password).toString();

  if (cryptoType === "aes-128-cbc-fixed") {
    const key = CryptoJS.enc.Utf8.parse(hash.substring(0, 16));
    const iv = CryptoJS.enc.Hex.parse("00000000000000000000000000000000");
    const decrypted = CryptoJS.AES.decrypt(encrypted, key, {
      iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });
    return JSON.parse(decrypted.toString(CryptoJS.enc.Utf8));
  }

  // legacy: CryptoJS.AES.decrypt(ciphertext, password_string)
  //   → uses EVP_BytesToKey internally with random salt (Salted__ format)
  const key = hash.substring(0, 16);
  const decrypted = CryptoJS.AES.decrypt(encrypted, key);
  return JSON.parse(decrypted.toString(CryptoJS.enc.Utf8));
}

// 扩展同步数据结构：{ cookie_data: { "域名": [{name, value, ...}, ...], ... } }
async function syncCookies(uuid: string, data: Record<string, unknown>): Promise<void> {
  const cookieData = data["cookie_data"] as Record<string, unknown[] | undefined> | undefined;
  if (!cookieData) return;

  // 整批替换放事务里：先删后插中途失败会丢该 UUID 全部已存 cookie（静默丢数据）
  await db.transaction(async (tx) => {
    await tx.delete(cookieStore).where(eq(cookieStore.uuid, uuid));

    for (const [domain, cookies] of Object.entries(cookieData)) {
      const platform = matchPlatform(domain);
      if (!platform || !Array.isArray(cookies) || cookies.length === 0) continue;

      const cookieStr = cookies
        .map((c) => {
          const cc = c as { name?: unknown; value?: unknown };
          return `${String(cc.name)}=${String(cc.value)}`;
        })
        .join("; ");

      await tx.insert(cookieStore).values({
        uuid,
        platform,
        cookies: cookieStr,
      });
    }
  });
}
