import { createDecipheriv, createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, setting, type SettingKey } from "@feedmind/db";
import { PlatformId } from "@feedmind/contracts";
import { decryptValue, encryptValue } from "../../lib/crypto/fernet.js";
import { logger } from "../../lib/logger.js";

// ─── 单例配置读写 ─────────────────────────────────────────────

export interface CookieCloudAccount {
  uuid: string;
  password: string; // Fernet 密文
  payload: string; // 扩展上传的密文原文
  crypto_type: string;
}

/** 平台 Cookie 条目：每平台一份，有变更即覆盖 */
export interface PlatformCookieEntry {
  cookies: string; // Fernet 密文
  valid: boolean | null;
  updated_at: string;
}

export type PlatformCookieDoc = Partial<Record<PlatformId, PlatformCookieEntry>>;

const EMPTY_ACCOUNT: CookieCloudAccount = {
  uuid: "",
  password: "",
  payload: "",
  crypto_type: "legacy",
};

async function readSetting<T>(key: SettingKey): Promise<T | null> {
  const [row] = await db
    .select({ value: setting.value })
    .from(setting)
    .where(eq(setting.key, key))
    .limit(1);
  return (row?.value as T | undefined) ?? null;
}

async function writeSetting(key: SettingKey, value: Record<string, unknown>): Promise<void> {
  const updatedAt = new Date().toISOString();
  await db
    .insert(setting)
    .values({ key, value, updatedAt })
    .onConflictDoUpdate({ target: setting.key, set: { value, updatedAt } });
}

// ─── CookieCloud 账号配置 ──────────────────────────────────────

/** 保存 UUID + 密码（密码 Fernet 加密落库，与 model apiKey 同策略） */
export async function saveConfig(
  uuid: string,
  password: string,
  cryptoType: string = "legacy",
): Promise<void> {
  const current = (await readSetting<CookieCloudAccount>("cookie_cloud")) ?? EMPTY_ACCOUNT;
  await writeSetting("cookie_cloud", {
    ...current,
    uuid,
    password: encryptValue(password),
    crypto_type: cryptoType,
  });
}

/** 按 uuid 读取账号配置；uuid 不匹配视为未配置 */
export async function getConfig(uuid: string): Promise<CookieCloudAccount | null> {
  const account = await readSetting<CookieCloudAccount>("cookie_cloud");
  if (!account || account.uuid !== uuid) return null;
  return account;
}

/**
 * 存储扩展推送的密文并解密写入平台 Cookie。
 *
 * uuid 是密钥材料而非查询键（CookieCloud 按 md5(uuid + '-' + password) 派生密钥），
 * 因此一律用「扩展上报的 uuid + 已保存密码」解密：扩展重装换 uuid 时自动自愈，
 * 成功后把账号 uuid 同步为上报值。
 */
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

  const account = await readSetting<CookieCloudAccount>("cookie_cloud");
  if (!account?.password) {
    // 尚未配置密码：先落盘数据，等用户在设置页补全 UUID + 密码
    await writeSetting("cookie_cloud", {
      uuid,
      password: account?.password ?? "",
      payload,
      crypto_type: cryptoType,
    });
    return;
  }

  let data: unknown;
  try {
    data = decrypt(uuid, payload, decryptValue(account.password), cryptoType);
  } catch (err) {
    // 抛给路由返回 4xx：扩展收到非 200 会显示同步失败，而不是静默假成功
    logger.error({ err, uuid }, "CookieCloud 数据解密失败");
    throw new Error("CookieCloud 数据解密失败：密码不匹配或数据损坏，请在前端重新保存密码", {
      cause: err,
    });
  }

  await writeSetting("cookie_cloud", {
    uuid,
    password: account.password,
    payload,
    crypto_type: cryptoType,
  });
  await syncCookies(data);
}

// ─── 平台 Cookie ──────────────────────────────────────────────

/** 解密 Cookie 密文，解密失败时按原值回退 */
function decryptCookiesField(value: string): string {
  try {
    return decryptValue(value);
  } catch {
    return value;
  }
}

/** 平台 Cookie 文档的落库校验：键必须是受控平台枚举（外部推送数据不可信）
 *  用 partialRecord：枚举键允许缺省（未使用过的平台不会有条目） */
const platformCookieDocSchema = z.partialRecord(
  PlatformId,
  z.object({
    cookies: z.string(),
    // 旧库迁移来的条目可能存的是 0/1，统一归一到布尔
    valid: z
      .union([z.boolean(), z.number(), z.null()])
      .transform((v) => (v === null ? null : Boolean(v))),
    updated_at: z.string(),
  }),
);

async function readPlatformCookieDoc(): Promise<PlatformCookieDoc> {
  const raw = await readSetting<unknown>("platform_cookie");
  const parsed = platformCookieDocSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : {};
}

/** 指定平台的明文 Cookie 串；未保存返回 null */
export async function getPlatformCookies(platform: string): Promise<string | null> {
  const doc = await readPlatformCookieDoc();
  const entry = doc[platform as PlatformId];
  return entry ? decryptCookiesField(entry.cookies) : null;
}

/** 回写登录态（探活/同步结果），并刷新条目时间戳 */
export async function setPlatformCookieValid(platform: string, valid: boolean): Promise<void> {
  const doc = await readPlatformCookieDoc();
  const entry = doc[platform as PlatformId];
  if (!entry) return;
  doc[platform as PlatformId] = { ...entry, valid, updated_at: new Date().toISOString() };
  await writeSetting("platform_cookie", doc as Record<string, unknown>);
}

/** 保存手动输入的 Cookie（覆盖该平台既有条目） */
export async function saveManualCookies(platform: string, cookies: string): Promise<void> {
  const doc = await readPlatformCookieDoc();
  doc[platform as PlatformId] = {
    cookies: encryptValue(cookies),
    valid: null,
    updated_at: new Date().toISOString(),
  };
  await writeSetting("platform_cookie", doc as Record<string, unknown>);
}

/** 平台 Cookie 行（API 响应形状，与前端契约保持一致） */
export interface CookieStoreRow {
  uuid: string;
  platform: string;
  cookies: string;
  valid: boolean | null;
  checkedAt: string | null;
}

function toCookieRows(doc: PlatformCookieDoc, accountUuid: string): CookieStoreRow[] {
  return Object.entries(doc).map(([platform, entry]) => ({
    uuid: accountUuid,
    platform,
    cookies: decryptCookiesField(entry!.cookies),
    valid: entry!.valid,
    checkedAt: entry!.updated_at,
  }));
}

export async function getCookies(platform: string): Promise<CookieStoreRow[]> {
  const [doc, account] = await Promise.all([
    readPlatformCookieDoc(),
    readSetting<CookieCloudAccount>("cookie_cloud"),
  ]);
  return toCookieRows(doc, account?.uuid ?? "manual").filter((r) => r.platform === platform);
}

export async function getAllCookies(): Promise<CookieStoreRow[]> {
  const [doc, account] = await Promise.all([
    readPlatformCookieDoc(),
    readSetting<CookieCloudAccount>("cookie_cloud"),
  ]);
  return toCookieRows(doc, account?.uuid ?? "manual");
}

// ─── 扩展推送解析 ─────────────────────────────────────────────

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
  const gzipped = contentEncoding === "gzip" || (raw[0] === 0x1f && raw[1] === 0x8b);
  const text = gzipped ? gunzipSync(raw).toString("utf8") : raw.toString("utf8");
  const json = JSON.parse(text);
  const parsed = updateBodySchema.safeParse(json);
  if (!parsed.success) {
    throw new Error("CookieCloud 请求体格式不符合规范");
  }
  return parsed.data;
}

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

/**
 * 扩展推送的 cookie_data → 平台 Cookie 文档。
 * 推送是其覆盖范围内平台的权威来源：本次未出现的平台条目一并清除（手动录入的条目同样按最后写入者胜处理）。
 */
export async function syncCookies(data: unknown): Promise<void> {
  const parsed = cookieDataSchema.safeParse(data);
  const cookieData = parsed.success ? parsed.data.cookie_data : undefined;
  if (!cookieData) return;

  const doc = await readPlatformCookieDoc();
  const now = new Date().toISOString();
  const pushed = new Set<PlatformId>();

  for (const [domain, cookies] of Object.entries(cookieData)) {
    if (!cookies || cookies.length === 0) continue;
    const platform = matchPlatform(domain);
    if (!platform) continue;
    pushed.add(platform);
    const plain = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    doc[platform] = {
      cookies: encryptValue(plain),
      valid: doc[platform]?.valid ?? null,
      updated_at: now,
    };
  }

  for (const platform of Object.keys(doc) as PlatformId[]) {
    if (!pushed.has(platform)) delete doc[platform];
  }

  await writeSetting("platform_cookie", doc as Record<string, unknown>);
}

// ─── 登录态校验 ───────────────────────────────────────────────

/** 支持 HTTP 登录态校验的平台（其余平台前端提示不支持校验） */
const HTTP_CHECKABLE = new Set(["bilibili", "zhihu", "weread"]);

/**
 * 校验指定平台 Cookie 登录态（纯 HTTP，不创建浏览器窗口），并把结果写回平台 Cookie 文档。
 * 各平台用自身轻量鉴权接口判断；接口不可用/网络异常时按"未知"处理不落库；
 * weread 风控类业务错误判失效落库（见 judgeWereadShelf，与爬虫语义一致）。
 */
export async function checkPlatformCookie(platform: string): Promise<{
  valid: boolean | null;
  checkedAt: string | null;
  supported: boolean;
}> {
  const cookies = await getPlatformCookies(platform);
  if (!cookies) return { valid: null, checkedAt: null, supported: false };

  const supported = HTTP_CHECKABLE.has(platform);
  let valid: boolean | null = null;
  if (supported) {
    try {
      valid = await checkCookieHttp(platform, cookies);
    } catch {
      // 网络波动等无法判定登录态：按"未知"处理，不落库，避免误报失效引导用户重登
      valid = null;
    }
  }

  if (valid !== null) await setPlatformCookieValid(platform, valid);
  return { valid, checkedAt: new Date().toISOString(), supported };
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

// ─── 解密实现（严格对齐 CookieCloud 算法）──────────────────────

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

// 严格对齐 CookieCloud 算法以保证兼容性；CookieCloud 若改算法这里需要同步更新。
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
