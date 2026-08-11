import { afterEach, describe, expect, it } from "vitest";
import { decryptValue, encryptValue } from "./fernet.js";

const KEY = "test-encryption-key-0123456789abcdef";

function withMissingEnvKey(run: () => void): void {
  const original = process.env["ENCRYPTION_KEY"];
  delete process.env["ENCRYPTION_KEY"];
  try {
    run();
  } finally {
    if (original !== undefined) process.env["ENCRYPTION_KEY"] = original;
  }
}

afterEach(() => {
  delete process.env["ENCRYPTION_KEY"];
});

describe("encryptValue / decryptValue", () => {
  it("往返解密出原文", () => {
    const token = encryptValue("敏感数据 api-key-123", KEY);
    expect(decryptValue(token, KEY)).toBe("敏感数据 api-key-123");
  });

  it("每次加密生成不同随机盐导致密文不同", () => {
    const a = encryptValue("same", KEY);
    const b = encryptValue("same", KEY);
    expect(a).not.toBe(b);
    expect(decryptValue(a, KEY)).toBe(decryptValue(b, KEY));
  });

  it("空串输入原样返回空串", () => {
    expect(encryptValue("", KEY)).toBe("");
    expect(decryptValue("", KEY)).toBe("");
  });

  it("未设置 ENCRYPTION_KEY 且无 keyOverride 时抛错", () => {
    withMissingEnvKey(() => {
      expect(() => encryptValue("x")).toThrow(/ENCRYPTION_KEY/);
      expect(() => decryptValue("x")).toThrow(/ENCRYPTION_KEY/);
    });
  });

  it("错误密钥解密抛错（GCM 认证失败）", () => {
    const token = encryptValue("secret", KEY);
    expect(() => decryptValue(token, "different-key")).toThrow();
  });

  it("篡改密文内容抛错（防重放认证）", () => {
    const token = encryptValue("secret", KEY);
    const tampered = `${token.slice(0, -4)}AAAA`;
    expect(() => decryptValue(tampered, KEY)).toThrow();
  });

  it("不支持的版本号抛错", () => {
    const token = encryptValue("secret", KEY);
    // 首字节是版本 0x81，改为 0x82 模拟未知版本
    const bytes = Buffer.from(token, "base64url");
    bytes[0] = 0x82;
    expect(() => decryptValue(bytes.toString("base64url"), KEY)).toThrow(
      /Unsupported token version/,
    );
  });

  it("截断的令牌抛错", () => {
    expect(() => decryptValue("aGVsbG8", KEY)).toThrow(/Invalid token/);
  });
});
