import { describe, expect, it } from "vitest";
import { LOG_LEVELS, isProductionEnv, resolveLogLevel } from "./logging.js";

describe("isProductionEnv", () => {
  it("识别 prod / production，其余视为非生产", () => {
    expect(isProductionEnv("production")).toBe(true);
    expect(isProductionEnv("PROD")).toBe(true);
    expect(isProductionEnv("development")).toBe(false);
    expect(isProductionEnv(undefined)).toBe(false);
  });
});

describe("resolveLogLevel", () => {
  it("显式 LOG_LEVEL 优先于环境默认", () => {
    expect(resolveLogLevel({ LOG_LEVEL: "warn", APP_ENV: "production" })).toBe("warn");
  });

  it("未设置时按环境给默认：开发 debug / 生产 info", () => {
    expect(resolveLogLevel({ APP_ENV: "development" })).toBe("debug");
    expect(resolveLogLevel({ APP_ENV: "production" })).toBe("info");
    expect(resolveLogLevel({})).toBe("debug");
  });

  it("允许全部声明的级别，非法值按未设置处理", () => {
    for (const level of LOG_LEVELS) {
      expect(resolveLogLevel({ LOG_LEVEL: level })).toBe(level);
    }
    expect(resolveLogLevel({ LOG_LEVEL: "verbose" })).toBe("debug");
  });
});
