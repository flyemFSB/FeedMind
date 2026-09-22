import { describe, expect, it } from "vitest";
import { parseDesktopEnv } from "./desktop.js";

describe("parseDesktopEnv", () => {
  it("未配置时使用硬编码默认值", () => {
    expect(parseDesktopEnv({})).toEqual({ API_PORT: 18790, CDP_PORT: 0 });
  });

  it("空串按未设置处理，不覆盖默认值", () => {
    expect(parseDesktopEnv({ API_PORT: "", CDP_PORT: "" }).API_PORT).toBe(18790);
  });

  it("显式值优先于默认值", () => {
    const env = parseDesktopEnv({ API_PORT: "19000", CDP_PORT: "9222" });
    expect(env.API_PORT).toBe(19000);
    expect(env.CDP_PORT).toBe(9222);
  });

  it("CDP_PORT=0 是合法的自动分配值", () => {
    expect(parseDesktopEnv({ CDP_PORT: "0" }).CDP_PORT).toBe(0);
  });

  it("非法端口直接失败而非静默回退", () => {
    expect(() => parseDesktopEnv({ CDP_PORT: "not-a-number" })).toThrow(/桌面端环境变量非法/);
    expect(() => parseDesktopEnv({ CDP_PORT: "-1" })).toThrow(/桌面端环境变量非法/);
    expect(() => parseDesktopEnv({ API_PORT: "70000" })).toThrow(/桌面端环境变量非法/);
  });
});
