import { describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import CryptoJS from "crypto-js";
import { decrypt, parseUpdateBody } from "./service.js";

// 用官方 CookieCloud 算法（README「Cookie Encryption and Decryption Algorithm」）加密，
// 验证本地解密兼容。官方密钥 = MD5(uuid-password) 前 16 字节：
// - legacy：CryptoJS.AES.encrypt(data, key)（Salted__ / EVP_BytesToKey 包装格式）
// - aes-128-cbc-fixed：MD5 全文前 16 字节作 key + 全零 IV + raw base64 密文（0.3.0+）
// 官方算法变动时这里先红，防止与扩展静默失配。

const UUID = "test-uuid";
const PASSWORD = "test-password";
const DATA = { cookie_data: { ".weread.qq.com": [{ name: "wr_skey", value: "abc123" }] } };

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
  it("legacy：官方 CryptoJS.AES.encrypt(data, key) 密文可解", () => {
    const key = CryptoJS.MD5(`${UUID}-${PASSWORD}`).toString().substring(0, 16);
    const encrypted = CryptoJS.AES.encrypt(JSON.stringify(DATA), key).toString();
    expect(decrypt(UUID, encrypted, PASSWORD, "legacy")).toEqual(DATA);
  });

  it("aes-128-cbc-fixed：全零 IV + raw base64 密文可解", () => {
    const hash = CryptoJS.MD5(`${UUID}-${PASSWORD}`).toString();
    const key = CryptoJS.enc.Utf8.parse(hash.substring(0, 16));
    const iv = CryptoJS.enc.Hex.parse("00000000000000000000000000000000");
    const encrypted = CryptoJS.AES.encrypt(JSON.stringify(DATA), key, {
      iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    }).ciphertext.toString(CryptoJS.enc.Base64);
    expect(decrypt(UUID, encrypted, PASSWORD, "aes-128-cbc-fixed")).toEqual(DATA);
  });

  it("密码错误时抛错（自动解密失败可被识别，不会静默写坏数据）", () => {
    const key = CryptoJS.MD5(`${UUID}-${PASSWORD}`).toString().substring(0, 16);
    const encrypted = CryptoJS.AES.encrypt(JSON.stringify(DATA), key).toString();
    expect(() => decrypt(UUID, encrypted, "wrong-password", "legacy")).toThrow();
  });
});
