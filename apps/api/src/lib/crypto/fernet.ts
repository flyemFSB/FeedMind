import { createCipheriv, createDecipheriv, createHash, pbkdf2Sync, randomBytes } from "node:crypto";

// ─── 常量 ───
const SALT_BYTES = 16;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const VERSION = 0x81;
const ITERATIONS = 600_000;

const derivedKeys = new Map<string, Buffer>();

function base64UrlEncode(buf: Buffer): string {
  return buf.toString("base64url");
}
function base64UrlDecode(s: string): Buffer {
  return Buffer.from(s, "base64url");
}

/** 获取加密密钥，优先使用传入值，缺失时读取 process.env.ENCRYPTION_KEY */
function resolveEncryptionKey(keyOverride?: string): string {
  const key = (keyOverride ?? process.env["ENCRYPTION_KEY"] ?? "").trim();
  if (!key) {
    throw new Error("ENCRYPTION_KEY 未配置，请在启动服务前于 .env 中配置");
  }
  return key;
}

function deriveKey(rawKey: string, salt: Buffer): Buffer {
  // 派生结果按 salt 缓存：避免相同密钥重复解密时产生 600k 次迭代计算开销
  const cacheKey = `${createHash("sha256").update(rawKey).digest("base64url").slice(0, 16)}:${salt.toString("base64url")}`;
  const cached = derivedKeys.get(cacheKey);
  if (cached) return cached;
  const key = pbkdf2Sync(rawKey, salt, ITERATIONS, 32, "sha256");
  if (derivedKeys.size >= 256) derivedKeys.clear();
  derivedKeys.set(cacheKey, key);
  return key;
}

export function encryptValue(plaintext: string, keyOverride?: string): string {
  if (!plaintext) return "";

  const rawKey = resolveEncryptionKey(keyOverride);
  const salt = randomBytes(SALT_BYTES);
  const nonce = randomBytes(NONCE_BYTES);
  const key = deriveKey(rawKey, salt);

  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return base64UrlEncode(Buffer.concat([Buffer.from([VERSION]), salt, nonce, encrypted, tag]));
}

export function decryptValue(ciphertext: string, keyOverride?: string): string {
  if (!ciphertext) return "";

  const rawKey = resolveEncryptionKey(keyOverride);
  const token = base64UrlDecode(ciphertext);
  if (token.length < 1 + SALT_BYTES + NONCE_BYTES + TAG_BYTES) {
    throw new Error("解密令牌无效");
  }

  const version = token[0];
  if (version !== VERSION) {
    throw new Error(`不支持的令牌版本: ${version}，请重新生成加密数据`);
  }

  let off = 1;
  const salt = token.subarray(off, off + SALT_BYTES);
  off += SALT_BYTES;
  const nonce = token.subarray(off, off + NONCE_BYTES);
  off += NONCE_BYTES;
  const tag = token.subarray(token.length - TAG_BYTES);
  const encrypted = token.subarray(off, token.length - TAG_BYTES);

  const key = deriveKey(rawKey, salt);
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch (err) {
    // GCM 认证失败通常由密钥不匹配或密文损坏引起，提示明确排查方向
    throw new Error(
      "解密失败：当前 ENCRYPTION_KEY 与加密该数据时使用的密钥不一致（或密文已损坏），请在 .env 中恢复原密钥",
      { cause: err },
    );
  }
}
