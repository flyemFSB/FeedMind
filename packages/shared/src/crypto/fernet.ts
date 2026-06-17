import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from "node:crypto";

// ─── 常量 ───
const SALT_BYTES = 16;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const VERSION = 0x81;
const ITERATIONS = 600_000;

function base64UrlEncode(buf: Buffer): string {
  return buf.toString("base64url");
}
function base64UrlDecode(s: string): Buffer {
  return Buffer.from(s, "base64url");
}

/**
 * 获取加密密钥。优先使用传入值，回退到环境变量。
 * 建议通过 @feedmind/env 的 apiEnv.ENCRYPTION_KEY 传入，确保启动时已校验。
 */
function resolveEncryptionKey(keyOverride?: string): string {
  const key = (keyOverride ?? process.env.ENCRYPTION_KEY ?? "").trim();
  if (!key) {
    throw new Error("ENCRYPTION_KEY is not set. Configure it in .env before starting the server.");
  }
  return key;
}

function deriveKey(rawKey: string, salt: Buffer): Buffer {
  return pbkdf2Sync(rawKey, salt, ITERATIONS, 32, "sha256");
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
    throw new Error("Invalid token.");
  }

  const version = token[0];
  if (version !== VERSION) {
    throw new Error(`Unsupported token version: ${version}. Regenerate the encrypted data.`);
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
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

/** 校验 ENCRYPTION_KEY 是否可用 */
export function validateEncryptionKey(): void {
  resolveEncryptionKey();
}
