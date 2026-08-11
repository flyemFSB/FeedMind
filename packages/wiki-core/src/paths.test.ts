import { describe, expect, it } from "vitest";
import {
  getFileName,
  getFileStem,
  getRelativePath,
  isAbsolutePath,
  joinPath,
  normalizeConceptPath,
  normalizePath,
  safeJoin,
} from "./paths.js";

describe("normalizePath / joinPath", () => {
  it("统一为 Unix 风格", () => {
    expect(normalizePath("a\\b\\c.md")).toBe("a/b/c.md");
  });

  it("joinPath 合并段并消除重复斜杠", () => {
    expect(joinPath("a", "/b", "c//d")).toBe("a/b/c/d");
  });
});

describe("getFileName / getFileStem", () => {
  it("提取文件名与去扩展名主干", () => {
    expect(getFileName("a/b/c.md")).toBe("c.md");
    expect(getFileStem("a/b/c.md")).toBe("c");
    expect(getFileStem("noext")).toBe("noext");
  });
});

describe("getRelativePath", () => {
  it("计算相对路径，base 尾斜杠不影响", () => {
    expect(getRelativePath("/wiki/a/b.md", "/wiki")).toBe("a/b.md");
    expect(getRelativePath("/wiki/a/b.md", "/wiki/")).toBe("a/b.md");
  });

  it("不在 base 下时原样返回", () => {
    expect(getRelativePath("/other/x.md", "/wiki")).toBe("/other/x.md");
  });
});

describe("isAbsolutePath", () => {
  it("识别各类绝对路径", () => {
    expect(isAbsolutePath("/a")).toBe(true);
    expect(isAbsolutePath("C:/a")).toBe(true);
    expect(isAbsolutePath("\\\\server\\share")).toBe(true);
    expect(isAbsolutePath("//server/share")).toBe(true);
    expect(isAbsolutePath("a/b")).toBe(false);
    expect(isAbsolutePath("")).toBe(false);
  });
});

describe("safeJoin", () => {
  const base = "/data/wiki";

  it("正常子路径拼接", () => {
    expect(safeJoin(base, "a/b.md")).toBe("/data/wiki/a/b.md");
  });

  it("拒绝绝对路径、空路径与路径穿越", () => {
    expect(() => safeJoin(base, "/etc/passwd")).toThrow(/Absolute path/);
    expect(() => safeJoin(base, "")).toThrow(/empty/i);
    expect(() => safeJoin(base, "../escape.md")).toThrow(/traversal/i);
    expect(() => safeJoin(base, "a/../b")).toThrow(/traversal/i);
  });

  it("拒绝控制字符", () => {
    expect(() => safeJoin(base, "a\nb.md")).toThrow(/Control/);
  });

  it("拒绝路径穿越的 .. 段", () => {
    // 命中 .. 段拦截；safeJoin 末尾的"拼接后逃逸 base"守卫在上游检查（绝对路径/.. /./ 段）下不可达，属防御性冗余
    expect(() => safeJoin(base, "..")).toThrow(/traversal/i);
  });
});

describe("normalizeConceptPath", () => {
  it("合法 Concept 路径返回归一化结果", () => {
    expect(normalizeConceptPath("a/b.md")).toBe("a/b.md");
  });

  it("拒绝绝对路径、Windows 非法字符、穿越与非 .md", () => {
    expect(() => normalizeConceptPath("/a.md")).toThrow(/Invalid OKF concept path/);
    expect(() => normalizeConceptPath("C:a.md")).toThrow(/Invalid OKF concept path/); // 盘符视为绝对
    expect(() => normalizeConceptPath("a<b.md")).toThrow(/illegal characters/);
    expect(() => normalizeConceptPath("a/../b.md")).toThrow(/traversal/i);
    expect(() => normalizeConceptPath("a.txt")).toThrow(/must end with .md/);
  });

  it("拒绝保留文件名 index/log", () => {
    expect(() => normalizeConceptPath("index.md")).toThrow(/Reserved/);
    expect(() => normalizeConceptPath("log.md")).toThrow(/Reserved/);
  });
});
