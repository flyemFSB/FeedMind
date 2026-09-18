import { describe, expect, it } from "vitest";
import * as path from "node:path";
import { DEFAULT_CDP_PORT, parseCdpPort, resolveDesktopDataDir } from "./bootstrap-utils.js";

describe("Desktop bootstrap utils", () => {
  describe("parseCdpPort", () => {
    it("未传入或为空时返回默认端口 9333", () => {
      expect(parseCdpPort(undefined)).toBe(DEFAULT_CDP_PORT);
      expect(parseCdpPort("")).toBe(DEFAULT_CDP_PORT);
    });

    it("正确解析有效端口字符串", () => {
      expect(parseCdpPort("9222")).toBe(9222);
      expect(parseCdpPort("1")).toBe(1);
      expect(parseCdpPort("65535")).toBe(65535);
    });

    it("非法字符串、超出范围端口回退默认端口", () => {
      expect(parseCdpPort("not-a-number")).toBe(DEFAULT_CDP_PORT);
      expect(parseCdpPort("0")).toBe(DEFAULT_CDP_PORT);
      expect(parseCdpPort("-1")).toBe(DEFAULT_CDP_PORT);
      expect(parseCdpPort("65536")).toBe(DEFAULT_CDP_PORT);
    });
  });

  describe("resolveDesktopDataDir", () => {
    it("环境变量 DATA_DIR 存在时优先采用", () => {
      const custom = path.resolve("/custom/path/data");
      expect(
        resolveDesktopDataDir({
          isPackaged: false,
          userDataPath: "/mock/user-data",
          appPath: "/mock/app",
          envDataDir: custom,
        }),
      ).toBe(custom);
    });

    it("打包模式下返回 userDataPath/data", () => {
      const result = resolveDesktopDataDir({
        isPackaged: true,
        userDataPath: path.resolve("/mock/user-data"),
        appPath: path.resolve("/mock/app"),
      });
      expect(result).toBe(path.resolve("/mock/user-data/data"));
    });

    it("开发模式下相对 appPath 解析上级 data 目录", () => {
      const appPath = path.resolve("/workspace/apps/desktop");
      const result = resolveDesktopDataDir({
        isPackaged: false,
        userDataPath: path.resolve("/mock/user-data"),
        appPath,
      });
      expect(result).toBe(path.resolve(appPath, "../../data"));
    });
  });
});
