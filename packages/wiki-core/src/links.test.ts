import { describe, expect, it } from "vitest";
import {
  conceptIdFromPath,
  extractConceptLinks,
  extractMarkdownLinks,
  formatConceptLink,
  normalizeConceptId,
  resolveConceptLink,
} from "./links.js";

describe("extractMarkdownLinks", () => {
  it("解析内联链接", () => {
    expect(extractMarkdownLinks("[A](a.md) 和 [B](/b.md)")).toEqual([
      { label: "A", target: "a.md" },
      { label: "B", target: "/b.md" },
    ]);
  });

  it("解析尖括号包裹与带标题的内联目标", () => {
    expect(extractMarkdownLinks('[A](<a b.md> "标题")')).toEqual([
      { label: "A", target: "a b.md" },
    ]);
  });

  it("解析引用式链接", () => {
    const content = "[A][ref]\n\n[ref]: /target.md";
    expect(extractMarkdownLinks(content)).toEqual([{ label: "A", target: "/target.md" }]);
  });

  it("解析快捷链接（复用标签作引用名）", () => {
    const content = "[target]\n\n[target]: /x.md";
    expect(extractMarkdownLinks(content)).toEqual([{ label: "target", target: "/x.md" }]);
  });

  it("忽略图片链接", () => {
    expect(extractMarkdownLinks("![alt](img.png)")).toEqual([]);
  });

  it("忽略代码块与行内代码中的链接", () => {
    const content = "```\n[a](fake.md)\n```\n\n正文 `[b](fake2.md)`";
    expect(extractMarkdownLinks(content)).toEqual([]);
  });

  it("引用标签忽略大小写与空白差异", () => {
    const content = "[A][My Ref]\n\n[my ref]: /t.md";
    expect(extractMarkdownLinks(content)).toEqual([{ label: "A", target: "/t.md" }]);
  });
});

describe("resolveConceptLink", () => {
  it("外部链接返回 null", () => {
    expect(resolveConceptLink("a", "https://example.com/x")).toBeNull();
    expect(resolveConceptLink("a", "//example.com/x")).toBeNull();
  });

  it("锚点与空目标返回 null", () => {
    expect(resolveConceptLink("a", "#section")).toBeNull();
    expect(resolveConceptLink("a", "")).toBeNull();
  });

  it("绝对路径直接作为 conceptId", () => {
    expect(resolveConceptLink("a", "/b/c.md")).toBe("b/c");
  });

  it("相对路径基于当前 concept 所在目录解析", () => {
    expect(resolveConceptLink("docs/a", "b.md")).toBe("docs/b");
    expect(resolveConceptLink("docs/a", "../top.md")).toBe("top");
  });

  it("URL 编码的目标先解码再解析", () => {
    expect(resolveConceptLink("a", "%E6%96%87%E6%A1%A3/b.md")).toBe("文档/b");
  });

  it("目录类目标（以 / 结尾）返回 null", () => {
    expect(resolveConceptLink("a", "b/")).toBeNull();
  });
});

describe("extractConceptLinks", () => {
  it("过滤外部链接只保留概念内链接", () => {
    const content = "[内部](b.md) [外部](https://x.com) [不存在的](c.md)";
    const links = extractConceptLinks(content, "a");
    expect(links).toEqual(["b", "c"]);
  });
});

describe("conceptIdFromPath / normalizeConceptId", () => {
  it("路径去掉扩展名并归一化", () => {
    expect(conceptIdFromPath("docs/a.md")).toBe("docs/a");
    expect(conceptIdFromPath("\\windows\\style\\b.md")).toBe("windows/style/b");
  });

  it("normalizeConceptId 解析 .. 与 . 段", () => {
    expect(normalizeConceptId("a/../b")).toBe("b");
    expect(normalizeConceptId("a/./b")).toBe("a/b");
    expect(normalizeConceptId("..")).toBe("");
  });
});

describe("formatConceptLink", () => {
  it("对每一段做 URL 编码生成链接", () => {
    expect(formatConceptLink("标签", "docs/中文 概念")).toBe(
      "[标签](/docs/%E4%B8%AD%E6%96%87%20%E6%A6%82%E5%BF%B5.md)",
    );
  });
});
