import { describe, expect, it } from "vitest";
import { toIsoString } from "./date.js";

describe("toIsoString", () => {
  it("null 与 undefined 返回 null", () => {
    expect(toIsoString(null)).toBeNull();
    expect(toIsoString(undefined)).toBeNull();
  });

  it("Date 实例转为 ISO 字符串", () => {
    const date = new Date("2026-08-09T12:00:00.000Z");
    expect(toIsoString(date)).toBe("2026-08-09T12:00:00.000Z");
  });

  it("ISO 字符串原样归一化", () => {
    expect(toIsoString("2026-08-09T12:00:00.000Z")).toBe("2026-08-09T12:00:00.000Z");
  });

  it("无效日期字符串抛错而非静默", () => {
    expect(() => toIsoString("not-a-date")).toThrow(RangeError);
  });
});
