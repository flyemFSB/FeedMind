import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDmVerifyInfo, addRenderData, addWbiVerifyInfo } from "./wbi-sign.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-09T00:00:00.000Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("addWbiVerifyInfo", () => {
  const VERIFY = "abcdefghijklmnopqrstuvwxyz123456";

  it("按排序参数 + wts + 验证串计算 MD5 签名", () => {
    const wts = Math.round(Date.now() / 1000);
    const sorted = "mid=123&pn=1&ps=30"; // 参数排序后
    const expectedRid = createHash("md5").update(`${sorted}&wts=${wts}${VERIFY}`).digest("hex");
    expect(addWbiVerifyInfo("mid=123&ps=30&pn=1", VERIFY)).toBe(
      `mid=123&ps=30&pn=1&w_rid=${expectedRid}&wts=${wts}`,
    );
  });

  it("相同输入产生确定签名（wts 固定时）", () => {
    expect(addWbiVerifyInfo("a=1&b=2", VERIFY)).toBe(addWbiVerifyInfo("a=1&b=2", VERIFY));
  });

  it("无参数时仍追加 w_rid 与 wts", () => {
    const result = addWbiVerifyInfo("", VERIFY);
    expect(result).toMatch(/^&w_rid=[0-9a-f]{32}&wts=\d+$/);
  });
});

describe("addDmVerifyInfo", () => {
  it("追加反爬探针参数，dm_img_str 为 no webgl 的 base64 截断", () => {
    const expected = Buffer.from("no webgl").toString("base64").slice(0, -2);
    const result = addDmVerifyInfo("a=1", "list-json");
    expect(result).toBe(
      `a=1&dm_img_list=list-json&dm_img_str=${expected}&dm_cover_img_str=${expected}`,
    );
  });
});

describe("addRenderData", () => {
  it("追加 URL 编码的 w_webid", () => {
    expect(addRenderData("a=1", "x&y=1")).toBe("a=1&w_webid=x%26y%3D1");
  });
});
