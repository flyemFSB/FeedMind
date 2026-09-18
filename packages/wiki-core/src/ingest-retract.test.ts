import { describe, expect, it } from "vitest";
import { computeRetractAction, isSystemWikiPath } from "./ingest-retract.js";

describe("isSystemWikiPath", () => {
  it("识别系统文件（含路径前缀与大小写）", () => {
    expect(isSystemWikiPath("wiki/index.md")).toBe(true);
    expect(isSystemWikiPath("wiki/log.md")).toBe(true);
    expect(isSystemWikiPath("index.md")).toBe(true);
    expect(isSystemWikiPath("concepts/INDEX.MD")).toBe(true);
    expect(isSystemWikiPath("concepts/foo.md")).toBe(false);
  });
});

describe("computeRetractAction", () => {
  const a = { resource: "foo.md" };
  const b = { resource: "bar.md" };

  it("本 source 不在 sources 中 → skip", () => {
    expect(computeRetractAction([b], "foo.md")).toEqual({ kind: "skip" });
    expect(computeRetractAction([], "foo.md")).toEqual({ kind: "skip" });
  });

  it("仅由本 source 贡献 → delete", () => {
    expect(computeRetractAction([a], "foo.md")).toEqual({ kind: "delete" });
    expect(computeRetractAction([a, { resource: "foo.md", title: "重复" }], "foo.md")).toEqual({
      kind: "delete",
    });
  });

  it("多源 → update 剩余 sources", () => {
    expect(computeRetractAction([a, b], "foo.md")).toEqual({ kind: "update", sources: [b] });
  });
});
