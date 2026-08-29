import { describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import { createHash, createCipheriv, randomBytes } from "node:crypto";
import { decrypt, judgeWereadShelf, parseUpdateBody } from "./service.js";

// 用官方 CookieCloud 算法（README「Cookie Encryption and Decryption Algorithm」）加密，
// 验证本地解密兼容。官方密钥 = MD5(uuid-password) 前 16 字节：
// - legacy：Salted__ / EVP_BytesToKey 派生 key/iv（CryptoJS 默认 OpenSSL 格式）
// - aes-128-cbc-fixed：MD5 全文前 16 字节作 key + 全零 IV + raw base64 密文（0.3.0+）

const UUID = "test-uuid";
const PASSWORD = "test-password";
const DATA = { cookie_data: { ".weread.qq.com": [{ name: "wr_skey", value: "abc123" }] } };

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

function encryptLegacy(data: unknown, passwordStr: string): string {
  const salt = randomBytes(8);
  const { key, iv } = evpBytesToKey(passwordStr, salt, 32, 16);
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(data), "utf8")),
    cipher.final(),
  ]);
  return Buffer.concat([Buffer.from("Salted__", "utf8"), salt, ciphertext]).toString("base64");
}

function encryptFixed(data: unknown, hash: string): string {
  const key = Buffer.from(hash.substring(0, 16), "utf8");
  const iv = Buffer.alloc(16, 0);
  const cipher = createCipheriv("aes-128-cbc", key, iv);
  return Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(data), "utf8")),
    cipher.final(),
  ]).toString("base64");
}

describe("weread 登录态判定（judgeWereadShelf）", () => {
  it("成功响应判有效：shelf/sync 的 200 响应体不含 errCode 字段，只有 books 等业务字段", () => {
    // 回归：此前以 errCode===0 判有效，而真实成功响应没有 errCode，
    // 导致有效 cookie 永远校验不出"已生效"（状态只能单向变坏）
    expect(judgeWereadShelf({ books: [{ bookId: "MP_WXS_1" }] })).toBe(true);
  });

  it("errCode=0 判有效", () => {
    expect(judgeWereadShelf({ errCode: 0, books: [] })).toBe(true);
  });

  it("-2010 登录失效判失效", () => {
    expect(judgeWereadShelf({ errCode: -2010 })).toBe(false);
  });

  it("-2041 等风控业务错误判失效，与爬虫抛错语义一致（引导重新登录）", () => {
    expect(judgeWereadShelf({ errCode: -2041, books: [] })).toBe(false);
  });

  it("无 errCode 且不含 books（意外响应格式）判未知，不误报“已生效”", () => {
    expect(judgeWereadShelf({})).toBeNull();
  });
});

describe("parseUpdateBody 请求体解析（明文/gzip）", () => {
  const BODY = JSON.stringify({
    uuid: "u1",
    encrypted: "E",
    crypto_type: "legacy",
  });

  it("明文 JSON 正常解析", () => {
    expect(parseUpdateBody(Buffer.from(BODY), null)).toEqual({
      uuid: "u1",
      encrypted: "E",
      crypto_type: "legacy",
    });
  });

  it("Content-Encoding: gzip 请求体解压后解析（官方扩展默认格式）", () => {
    const raw = gzipSync(Buffer.from(BODY));
    expect(parseUpdateBody(raw, "gzip")).toEqual({
      uuid: "u1",
      encrypted: "E",
      crypto_type: "legacy",
    });
  });

  it("无 Content-Encoding 头时按 gzip 魔数自动识别", () => {
    const raw = gzipSync(Buffer.from(BODY));
    expect(parseUpdateBody(raw, null)).toEqual({
      uuid: "u1",
      encrypted: "E",
      crypto_type: "legacy",
    });
  });

  it("非法数据抛 JSON 解析错误", () => {
    expect(() => parseUpdateBody(Buffer.from("not-json"), null)).toThrow();
  });
});

describe("CookieCloud decrypt 协议兼容", () => {
  it("legacy：OpenSSL Salted__ 格式密文可解", () => {
    const key = createHash("md5").update(`${UUID}-${PASSWORD}`).digest("hex").substring(0, 16);
    const encrypted = encryptLegacy(DATA, key);
    expect(decrypt(UUID, encrypted, PASSWORD, "legacy")).toEqual(DATA);
  });

  it("aes-128-cbc-fixed：全零 IV + raw base64 密文可解", () => {
    const hash = createHash("md5").update(`${UUID}-${PASSWORD}`).digest("hex");
    const encrypted = encryptFixed(DATA, hash);
    expect(decrypt(UUID, encrypted, PASSWORD, "aes-128-cbc-fixed")).toEqual(DATA);
  });

  it("密码错误时抛错（自动解密失败可被识别，不会静默写坏数据）", () => {
    const key = createHash("md5").update(`${UUID}-${PASSWORD}`).digest("hex").substring(0, 16);
    const encrypted = encryptLegacy(DATA, key);
    expect(() => decrypt(UUID, encrypted, "wrong-password", "legacy")).toThrow();
  });
});
