import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  pbkdf2Sync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

// Fernet 对称加密实现，用于加密存储 LLM API Key
// 格式：version(1B) | timestamp(8B) | iv(16B) | ciphertext | HMAC(32B)
const DEV_KEY = "dev-encryption-key-do-not-use-in-production";
const SALT = Buffer.from("feedmind-key-salt");
const ITERATIONS = 600_000;

function base64UrlEncode(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
}

function base64UrlDecode(input: string): Buffer {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64");
}

// PBKDF2 密钥派生，与旧 Python Fernet 实现参数一致以兼容已有密文
export function deriveFernetKey(rawKey: string): Buffer {
  return pbkdf2Sync(rawKey || DEV_KEY, SALT, ITERATIONS, 32, "sha256");
}

function splitKey(key: Buffer): { signingKey: Buffer; encryptionKey: Buffer } {
  if (key.length !== 32) throw new Error("Fernet key must be 32 bytes.");
  return {
    signingKey: key.subarray(0, 16),
    encryptionKey: key.subarray(16),
  };
}

function sign(signingKey: Buffer, body: Buffer): Buffer {
  return createHmac("sha256", signingKey).update(body).digest();
}

export function encryptValue(plaintext: string, rawKey = process.env.ENCRYPTION_KEY ?? ""): string {
  if (!plaintext) return "";

  const { signingKey, encryptionKey } = splitKey(deriveFernetKey(rawKey));
  const version = Buffer.from([0x80]);
  const timestamp = Buffer.alloc(8);
  timestamp.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000)));
  const iv = randomBytes(16);

  const cipher = createCipheriv("aes-128-cbc", encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const body = Buffer.concat([version, timestamp, iv, ciphertext]);
  return base64UrlEncode(Buffer.concat([body, sign(signingKey, body)]));
}

export function decryptValue(ciphertext: string, rawKey = process.env.ENCRYPTION_KEY ?? ""): string {
  if (!ciphertext) return "";

  const token = base64UrlDecode(ciphertext);
  if (token.length < 1 + 8 + 16 + 32 || token[0] !== 0x80) {
    throw new Error("Invalid Fernet token.");
  }

  const { signingKey, encryptionKey } = splitKey(deriveFernetKey(rawKey));
  const body = token.subarray(0, -32);
  const mac = token.subarray(-32);
  const expectedMac = sign(signingKey, body);
  if (mac.length !== expectedMac.length || !timingSafeEqual(mac, expectedMac)) {
    throw new Error("Invalid Fernet token signature.");
  }

  const iv = body.subarray(9, 25);
  const encrypted = body.subarray(25);
  const decipher = createDecipheriv("aes-128-cbc", encryptionKey, iv);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
