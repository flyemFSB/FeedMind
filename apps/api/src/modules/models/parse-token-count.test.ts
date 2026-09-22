import { describe, expect, it } from "vitest";
import { parseTokenCount } from "./parse-token-count.js";

// 该值直接决定下发给大模型的 max_tokens 与上下文预算，解析偏差会静默截断输出
describe("parseTokenCount", () => {
  it("数字按 K tokens 换算为绝对值", () => {
    expect(parseTokenCount(64)).toBe(64_000);
    expect(parseTokenCount(128)).toBe(128_000);
    expect(parseTokenCount(0.5)).toBe(500);
  });

  it("字符串无单位后缀同样按 K tokens 处理", () => {
    expect(parseTokenCount("128")).toBe(128_000);
    expect(parseTokenCount(" 64 ")).toBe(64_000);
  });

  it("显式 K/M 后缀按对应量级换算，且大小写不敏感", () => {
    expect(parseTokenCount("64K")).toBe(64_000);
    expect(parseTokenCount("64k")).toBe(64_000);
    expect(parseTokenCount("1M")).toBe(1_000_000);
    expect(parseTokenCount("1.5m")).toBe(1_500_000);
    expect(parseTokenCount("64.5K")).toBe(64_500);
  });

  it("缺失或空值返回 undefined（调用方据此不下发 max_tokens）", () => {
    expect(parseTokenCount(null)).toBeUndefined();
    expect(parseTokenCount(undefined)).toBeUndefined();
    expect(parseTokenCount("")).toBeUndefined();
  });

  it("非正数与非有限数返回 undefined", () => {
    expect(parseTokenCount(0)).toBeUndefined();
    expect(parseTokenCount(-1)).toBeUndefined();
    expect(parseTokenCount(Number.NaN)).toBeUndefined();
    expect(parseTokenCount(Number.POSITIVE_INFINITY)).toBeUndefined();
  });

  it("无法识别的字符串返回 undefined", () => {
    expect(parseTokenCount("abc")).toBeUndefined();
    expect(parseTokenCount("K")).toBeUndefined();
    expect(parseTokenCount("64KB")).toBeUndefined();
  });
});
