import { createHash, createDecipheriv } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { db, cookieCloud, cookieStore } from "@feedmind/db";
import { and, eq } from "drizzle-orm";
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

import { z } from "zod";

const updateBodySchema = z.object({
  uuid: z.string().optional(),
  encrypted: z.string().optional(),
  crypto_type: z.string().optional(),
});

const cookieItemSchema = z.object({
  name: z.union([z.string(), z.number()]),
  value: z.union([z.string(), z.number()]),
});

const cookieDataSchema = z.object({
  cookie_data: z.record(z.string(), z.array(cookieItemSchema).optional()).optional(),
});

export type CookieCloudUpdateBody = z.infer<typeof updateBodySchema>;

// CookieCloud 扩展 POST /update 的请求体：明文 JSON 或 gzip 压缩（数据大时默认）。
// Node 服务端不自动解压请求体，需按 Content-Encoding/魔数判断后手动解压。
export function parseUpdateBody(
  raw: Buffer,
  contentEncoding: string | null,
): CookieCloudUpdateBody {
  const gzipped =
    contentEncoding?.toLowerCase().includes("gzip") ??
    (raw.length >= 2 && raw[0] === 0x1f && raw[1] === 0x8b);
  const text = gzipped ? gunzipSync(raw).toString("utf8") : raw.toString("utf8");
  const json = JSON.parse(text);
  const parsed = updateBodySchema.safeParse(json);
  if (!parsed.success) {
    throw new Error("CookieCloud 请求体格式不符合规范");
  }
  return parsed.data;
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
      // 抛给路由返回 4xx：扩展收到非 200 会显示同步失败，而不是静默假成功
      logger.error({ err, uuid }, "CookieCloud 数据解密失败");
      throw new Error("CookieCloud 数据解密失败：密码不匹配或数据损坏，请在前端重新保存密码", {
        cause: err,
      });
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

/** 支持 HTTP 登录态校验的平台（其余平台前端提示不支持校验） */
const HTTP_CHECKABLE = new Set(["bilibili", "zhihu", "weread"]);

/**
 * 校验指定平台 Cookie 登录态（纯 HTTP，不创建浏览器窗口），并把结果写回 cookie_store。
 * 各平台用自身轻量鉴权接口判断；接口不可用/网络异常时按"未知"处理不落库；
 * weread 风控类业务错误判失效落库（见 mapWereadErrCode，与爬虫语义一致）。
 * supported 表示平台本身是否支持该校验方式，与 valid 是否可判定无关，
 * 否则 weread 网络异常（valid=null）会被前端误读为"不支持校验"。
 */
export async function checkPlatformCookie(platform: string): Promise<{
  valid: boolean | null;
  checkedAt: string | null;
  supported: boolean;
}> {
  const rows = await db.select().from(cookieStore).where(eq(cookieStore.platform, platform)).all();
  if (rows.length === 0) return { valid: null, checkedAt: null, supported: false };

  const supported = HTTP_CHECKABLE.has(platform);
  const cookies = joinCookies(rows);
  let valid: boolean | null = null;
  if (supported) {
    try {
      valid = await checkCookieHttp(platform, cookies);
    } catch {
      // 网络波动等无法判定登录态：按"未知"处理，不落库，避免误报失效引导用户重登
      valid = null;
    }
  }
  const checkedAt = new Date().toISOString();

  if (valid !== null) {
    await db
      .update(cookieStore)
      .set({ valid, checkedAt })
      .where(eq(cookieStore.platform, platform));
  }
  return { valid, checkedAt, supported };
}

/**
 * weread shelf/sync 响应 → 登录态判定，与 crawler-core weread.ts 的抛错语义对齐：
 * 非零 errCode（-2010 登录失效、-2041 风控等）判失效。注意成功响应不含 errCode 字段
 * （实测 200 响应体只有 pureBookCount/synckey/books 等），不能以 errCode===0 判有效，
 * 否则有效 cookie 永远校验不出"已生效"；以 books 数组存在佐证书架可用，
 * 缺失时判未知不落库，避免意外响应格式被误报成"已生效"。
 */
export function judgeWereadShelf(resp: { errCode?: number; books?: unknown[] }): boolean | null {
  if (resp.errCode) return false;
  return Array.isArray(resp.books) ? true : null;
}

// 各平台登录态探测：返回 true=有效 / false=失效 / null=该平台不支持 HTTP 校验或无法判定
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
      const o = (await r.json()) as { errCode?: number; books?: unknown[] };
      return judgeWereadShelf(o);
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

// EVP_BytesToKey：兼容 OpenSSL / CryptoJS legacy 加密格式（Salted__ + MD5 派生 key/iv）
function evpBytesToKey(
  password: string,
  salt: Buffer,
  keyLen: number,
  ivLen: number,
): { key: Buffer; iv: Buffer } {
  let d = Buffer.alloc(0);
  let concatenated = Buffer.alloc(0);
  while (concatenated.length < keyLen + ivLen) {
    d = createHash("md5")
      .update(Buffer.concat([d, Buffer.from(password, "utf8"), salt]))
      .digest();
    concatenated = Buffer.concat([concatenated, d]);
  }
  return {
    key: concatenated.subarray(0, keyLen),
    iv: concatenated.subarray(keyLen, keyLen + ivLen),
  };
}

// 严格对齐 CookieCloud 算法以保证兼容性；
// CookieCloud 如果改算法这里需要同步更新。
export function decrypt(
  uuid: string,
  encrypted: string,
  password: string,
  cryptoType: string = "legacy",
): unknown {
  const hash = createHash("md5")
    .update(uuid + "-" + password)
    .digest("hex");

  if (cryptoType === "aes-128-cbc-fixed") {
    const key = Buffer.from(hash.substring(0, 16), "utf8");
    const iv = Buffer.alloc(16, 0);
    const decipher = createDecipheriv("aes-128-cbc", key, iv);
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encrypted, "base64")),
      decipher.final(),
    ]);
    return JSON.parse(decrypted.toString("utf8"));
  }

  // legacy 模式：对齐 CookieCloud 默认 OpenSSL Salted 格式（EVP_BytesToKey MD5 派生 32 字节 Key 与 16 字节 IV）
  const keyStr = hash.substring(0, 16);
  const raw = Buffer.from(encrypted, "base64");
  if (raw.subarray(0, 8).toString("utf8") !== "Salted__") {
    throw new Error("Invalid legacy ciphertext: missing Salted__ header");
  }
  const salt = raw.subarray(8, 16);
  const ciphertext = raw.subarray(16);
  const { key, iv } = evpBytesToKey(keyStr, salt, 32, 16);
  const decipher = createDecipheriv("aes-256-cbc", key, iv);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(decrypted.toString("utf8"));
}

// 扩展同步数据结构：{ cookie_data: { "域名": [{name, value, ...}, ...], ... } }
export async function syncCookies(uuid: string, data: unknown): Promise<void> {
  const parsed = cookieDataSchema.safeParse(data);
  const cookieData = parsed.success ? parsed.data.cookie_data : undefined;
  if (!cookieData) return;

  // 逐平台 upsert 只覆盖 cookies，保留既有 valid/checked_at：推送代表 cookie 值更新而非
  // 登录态变化，删表重建会把校验记录清零，面板状态在"有效/失效/未检测"间反复横跳。
  // 推送中消失的平台仍要删除，否则拼接 cookie 会继续带上浏览器里已不存在的旧值
  await db.transaction(async (tx) => {
    const pushedPlatforms = new Set<string>();
    for (const [domain, cookies] of Object.entries(cookieData)) {
      const platform = matchPlatform(domain);
      if (!platform || !Array.isArray(cookies) || cookies.length === 0) continue;
      pushedPlatforms.add(platform);

      const cookieStr = cookies.map((c) => `${String(c.name)}=${String(c.value)}`).join("; ");
      await tx
        .insert(cookieStore)
        .values({ uuid, platform, cookies: cookieStr })
        .onConflictDoUpdate({
          target: [cookieStore.uuid, cookieStore.platform],
          set: { cookies: cookieStr },
        });
    }

    const existing = await tx
      .select({ platform: cookieStore.platform })
      .from(cookieStore)
      .where(eq(cookieStore.uuid, uuid));
    for (const row of existing) {
      if (!pushedPlatforms.has(row.platform)) {
        await tx
          .delete(cookieStore)
          .where(and(eq(cookieStore.uuid, uuid), eq(cookieStore.platform, row.platform)));
      }
    }
  });
}
