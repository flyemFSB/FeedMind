import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { parseActivePort, readActivePort, resolveDesktopDataDir } from "./bootstrap-utils.js";

describe("Desktop bootstrap utils", () => {
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

describe("parseActivePort", () => {
  it("取首行端口，忽略 Chromium 追加的 browser guid 行", () => {
    expect(parseActivePort("52341\n/devtools/browser/abc-def\r\n")).toBe(52341);
  });

  it("空文件、非数字与越界端口一律返回 null", () => {
    expect(parseActivePort("")).toBeNull();
    expect(parseActivePort("0")).toBeNull();
    expect(parseActivePort("not-a-port")).toBeNull();
    expect(parseActivePort("70000")).toBeNull();
  });
});

describe("readActivePort", () => {
  it("读取会话目录下的 DevToolsActivePort，文件缺失返回 null", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "feedmind-cdp-"));
    try {
      expect(readActivePort(dir)).toBeNull();
      writeFileSync(path.join(dir, "DevToolsActivePort"), "51820\n/devtools/browser/x\n");
      expect(readActivePort(dir)).toBe(51820);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
