import { afterEach, describe, expect, it, vi } from "vitest";
import { decryptValue, encryptValue } from "./fernet.js";

const pbkdf2Calls = vi.hoisted(() => ({ count: 0 }));

// consistent-type-imports 禁止 import() 类型标注，故借函数返回值推断模块命名空间类型
async function loadCrypto() {
  return import("node:crypto");
}
type CryptoModule = Awaited<ReturnType<typeof loadCrypto>>;

// 统计派生调用次数：缓存是性能契约，PBKDF2 单次 600k 迭代，失效会让每次解密都重算
vi.mock("node:crypto", async (importOriginal) => {
  const orig = (await importOriginal()) as CryptoModule;
  return {
    ...orig,
    pbkdf2Sync: (...args: Parameters<CryptoModule["pbkdf2Sync"]>) => {
      pbkdf2Calls.count += 1;
      return orig.pbkdf2Sync(...args);
    },
  };
});

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

  // 派生结果按盐缓存；新盐不得清空既有条目，否则重复解密退化为每次重算
  it("派生密钥缓存按盐命中，新盐不清空既有缓存", () => {
    const tokenA = encryptValue("payload-a", KEY);
    const tokenB = encryptValue("payload-b", KEY);

    pbkdf2Calls.count = 0;
    decryptValue(tokenA, KEY);
    decryptValue(tokenB, KEY);
    expect(pbkdf2Calls.count).toBe(0);

    encryptValue("payload-c", KEY);
    expect(pbkdf2Calls.count).toBe(1);

    decryptValue(tokenA, KEY);
    expect(pbkdf2Calls.count).toBe(1);
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

  it("错误密钥解密抛错并给出可诊断提示（GCM 认证失败）", () => {
    const token = encryptValue("secret", KEY);
    expect(() => decryptValue(token, "different-key")).toThrow(/密钥不一致/);
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
    expect(() => decryptValue(bytes.toString("base64url"), KEY)).toThrow(/不支持的令牌版本/);
  });

  it("截断的令牌抛错", () => {
    expect(() => decryptValue("aGVsbG8", KEY)).toThrow(/解密令牌无效/);
  });
});
