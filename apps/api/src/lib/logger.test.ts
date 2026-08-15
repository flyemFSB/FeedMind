import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import pino from "pino";

// 脱敏是安全要求：redact 路径配置（apiKey/password/cookies 等）写错会让密钥进日志。
// APP_ENV=production 重载 logger 跳过 pino-pretty transport（worker 直写 fd 无法 spy），
// 生产输出走 SonicBoom 流，spy streamSym.write 同步捕获 JSON。
// consistent-type-imports 禁止 typeof import() 类型标注，故借函数返回值推断模块命名空间类型
type LoggerModule = Awaited<ReturnType<typeof importLogger>>;
async function importLogger() {
  return import("./logger.js");
}
let mod: LoggerModule;
let chunks: string[];

beforeEach(async () => {
  vi.stubEnv("APP_ENV", "production");
  vi.resetModules();
  mod = await import("./logger.js");
  chunks = [];
  const stream = Reflect.get(mod.logger, pino.symbols.streamSym) as {
    write: (c: string) => boolean;
  };
  vi.spyOn(stream, "write").mockImplementation((c) => {
    chunks.push(String(c));
    return true;
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("logger 敏感字段脱敏", () => {
  it("顶层与嵌套 apiKey/password/cookies 均被 censored，明文不进日志", () => {
    mod.logger.info(
      {
        apiKey: "sk-top-secret",
        password: "pw-123",
        cookies: "sid=abc",
        nested: { apiKey: "sk-nested" },
        ok: "可见",
      },
      "脱敏测试",
    );

    const text = chunks.join("");
    expect(text).toContain("[REDACTED]");
    expect(text).not.toContain("sk-top-secret");
    expect(text).not.toContain("pw-123");
    expect(text).not.toContain("sid=abc");
    expect(text).not.toContain("sk-nested");
    expect(text).toContain("可见");
  });

  it("err 对象中的 cookies 字段被 censored", () => {
    mod.logger.error({ err: new Error("boom"), cookies: "secret-cookie" }, "失败");
    const text = chunks.join("");
    expect(text).toContain("[REDACTED]");
    expect(text).not.toContain("secret-cookie");
  });
});
