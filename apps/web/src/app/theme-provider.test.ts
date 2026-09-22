import { describe, expect, it } from "vitest";
import { resolveSystemTheme } from "./theme-provider";

describe("resolveSystemTheme", () => {
  it("主进程下发的原生主题优先于媒体查询", () => {
    expect(resolveSystemTheme("dark", false)).toBe("dark");
    expect(resolveSystemTheme("light", true)).toBe("light");
  });

  it("无下发值时回退媒体查询（浏览器环境）", () => {
    expect(resolveSystemTheme(undefined, true)).toBe("dark");
    expect(resolveSystemTheme(undefined, false)).toBe("light");
  });
});
