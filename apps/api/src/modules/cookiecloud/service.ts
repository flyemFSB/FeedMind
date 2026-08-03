import CryptoJS from "crypto-js";
import { db, cookieCloud, cookieStore } from "@feedmind/db";
import { eq } from "drizzle-orm";
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
};

// 保存 UUID + 密码配置
export async function saveConfig(
  uuid: string,
  password: string,
  cryptoType: string = "legacy",
): Promise<void> {
  await db
    .insert(cookieCloud)
    .values({ uuid, password, encrypted: "", cryptoType })
    .onConflictDoUpdate({
      target: cookieCloud.uuid,
      set: { password, cryptoType },
    });
}

// 存储加密数据并自动解密写入 cookie_cloud
export async function storeEncrypted(
  uuid: string,
  encrypted: string,
  cryptoType: string,
): Promise<void> {
  const config = await db.select().from(cookieCloud).where(eq(cookieCloud.uuid, uuid)).get();

  if (!config) {
    await db
      .insert(cookieCloud)
      .values({ uuid, password: "", encrypted, cryptoType })
      .onConflictDoUpdate({ target: cookieCloud.uuid, set: { encrypted } });
    logger.info({ cryptoType, decrypted: false }, "CookieCloud 加密数据已接收");
    return;
  }

  await db.update(cookieCloud).set({ encrypted }).where(eq(cookieCloud.uuid, uuid));

  if (config.password) {
    try {
      const data = decrypt(uuid, encrypted, config.password, cryptoType);
      await syncCookies(uuid, data as CookieCloudData);
      logger.info({ cryptoType, decrypted: true }, "CookieCloud Cookie 同步完成");
    } catch (err) {
      logger.warn({ uuid, err }, "CookieCloud 解密失败 — UUID 或密码不匹配");
    }
  } else {
    logger.info({ cryptoType, decrypted: false }, "CookieCloud 加密数据已接收");
  }
}

export async function getAllConfigs(): Promise<CookieCloudRow[]> {
  return db.select().from(cookieCloud).all();
}

export async function getEncrypted(uuid: string): Promise<CookieCloudRow | null> {
  const row = await db.select().from(cookieCloud).where(eq(cookieCloud.uuid, uuid)).get();
  return row ?? null;
}

export async function getCookies(platform: string): Promise<CookieStoreRow[]> {
  return db.select().from(cookieStore).where(eq(cookieStore.platform, platform)).all();
}

export async function getAllCookies(): Promise<CookieStoreRow[]> {
  return db.select().from(cookieStore).all();
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

// 严格对齐 CookieCloud 扩展的加解密逻辑
// CookieCloud 开源地址: https://github.com/easychen/CookieCloud
export function decrypt(
  uuid: string,
  encrypted: string,
  password: string,
  cryptoType: string = "legacy",
): unknown {
  const hash = CryptoJS.MD5(uuid + "-" + password).toString();

  if (cryptoType === "aes-128-cbc-fixed") {
    const key = CryptoJS.enc.Hex.parse(hash.substring(0, 32));
    const iv = CryptoJS.enc.Hex.parse("00000000000000000000000000000000");
    const decrypted = CryptoJS.AES.decrypt(encrypted, key, {
      iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });
    return JSON.parse(decrypted.toString(CryptoJS.enc.Utf8));
  }

  // legacy 协议以 MD5 的前 16 个字符作为 CryptoJS passphrase。
  const decrypted = CryptoJS.AES.decrypt(encrypted, hash.substring(0, 16));
  return JSON.parse(decrypted.toString(CryptoJS.enc.Utf8));
}

// CookieCloud 解密数据的结构：cookie_data 按域名分组，每组是 Cookie 对象数组
interface CookieCloudData {
  cookie_data?: Record<string, { name: string; value: string }[]>;
}

async function syncCookies(uuid: string, data: CookieCloudData): Promise<void> {
  const cookieData = data.cookie_data;
  if (!cookieData) return;

  await db.delete(cookieStore).where(eq(cookieStore.uuid, uuid));

  for (const [domain, cookies] of Object.entries(cookieData)) {
    const platform = matchPlatform(domain);
    if (!platform || !Array.isArray(cookies) || cookies.length === 0) continue;

    const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    await db.insert(cookieStore).values({
      uuid,
      platform,
      cookies: cookieStr,
    });
  }
}

function matchPlatform(domain: string): PlatformId | null {
  const d = domain.toLowerCase();
  for (const [prefix, platform] of Object.entries(DOMAIN_TO_PLATFORM)) {
    if (d === prefix || d.endsWith(prefix)) return platform;
    const bare = prefix.replace(/^\./, "");
    if (d === bare || d.endsWith("." + bare)) return platform;
  }
  return null;
}
