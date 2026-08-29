import { describe, expect, it } from "vitest";
import {
  buildConceptContent,
  extractGeneratedAt,
  extractSources,
  extractString,
  extractStringArray,
  extractType,
  mergeConceptContent,
  parseFrontmatter,
} from "./frontmatter.js";

describe("parseFrontmatter", () => {
  it("解析合法 frontmatter 并分离正文", () => {
    const content = "---\ntype: note\ntitle: 示例\n---\n\n# 正文内容";
    const result = parseFrontmatter(content);
    expect(result.valid).toBe(true);
    expect(result.hasFrontmatter).toBe(true);
    expect(result.frontmatter).toEqual({ type: "note", title: "示例" });
    expect(result.body).toContain("# 正文内容");
  });

  it("无 frontmatter 时原样返回 body", () => {
    const result = parseFrontmatter("没有 frontmatter 的内容");
    expect(result.hasFrontmatter).toBe(false);
    expect(result.valid).toBe(true);
    expect(result.body).toBe("没有 frontmatter 的内容");
  });

  it("非法 YAML 标记为无效并携带错误信息", () => {
    const result = parseFrontmatter("---\nkey: [未闭合\n---\nbody");
    expect(result.valid).toBe(false);
    expect(result.hasFrontmatter).toBe(true);
    expect(result.error).toBeTruthy();
  });

  it("frontmatter 非 YAML mapping 时拒绝", () => {
    const result = parseFrontmatter("---\n- a\n- b\n---\nbody");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/mapping/);
  });

  // js-yaml 5 起 load('') 从返回 undefined 改为抛错：空 frontmatter 块两侧版本都须标记无效
  it("空 frontmatter 块标记为无效", () => {
    const result = parseFrontmatter("---\n\n---\nbody");
    expect(result.valid).toBe(false);
    expect(result.hasFrontmatter).toBe(true);
    expect(result.error).toBeTruthy();
  });
});

describe("buildConceptContent", () => {
  it("按 OKF v0.2 生成 frontmatter 与正文", () => {
    const content = buildConceptContent({
      type: "concept",
      title: "标题",
      tags: ["a", "b"],
      generated: { by: "ingest", at: "2026-08-09T00:00:00.000Z" },
      content: "# 正文",
    });
    const parsed = parseFrontmatter(content);
    expect(parsed.valid).toBe(true);
    expect(parsed.frontmatter).toMatchObject({
      type: "concept",
      title: "标题",
      tags: ["a", "b"],
      generated: { by: "ingest", at: "2026-08-09T00:00:00.000Z" },
    });
    expect(parsed.body).toBe("# 正文");
  });

  it("undefined 字段不写入 frontmatter", () => {
    const content = buildConceptContent({ type: "concept", content: "正文" });
    const parsed = parseFrontmatter(content);
    expect(parsed.frontmatter).toEqual({ type: "concept" });
  });
});

describe("extractSources", () => {
  it("对象条目按 resource 去重，后者覆盖前者", () => {
    const sources = extractSources({
      sources: [
        { resource: "a", title: "第一版" },
        { resource: "a", title: "第二版" },
        { resource: "b" },
      ],
    });
    expect(sources).toHaveLength(2);
    expect(sources.find((s) => s.resource === "a")?.title).toBe("第二版");
  });

  it("兼容 v0.1 provenance 字符串数组", () => {
    const sources = extractSources({ provenance: ["https://a.com", "https://b.com"] });
    expect(sources.map((s) => s.resource)).toEqual(["https://a.com", "https://b.com"]);
  });

  it("跳过空字符串与缺 resource 的条目", () => {
    const sources = extractSources({ sources: ["", { title: "无 resource" }] });
    expect(sources).toEqual([]);
  });
});

describe("extractGeneratedAt", () => {
  it("读取 generated.at", () => {
    expect(
      extractGeneratedAt({ generated: { by: "ingest", at: "2026-08-09T00:00:00.000Z" } }),
    ).toBe("2026-08-09T00:00:00.000Z");
  });

  it("缺失或结构非法时返回 undefined", () => {
    expect(extractGeneratedAt({})).toBeUndefined();
    expect(extractGeneratedAt({ generated: "字符串" })).toBeUndefined();
    expect(extractGeneratedAt({ generated: { at: 123 } })).toBeUndefined();
  });
});

describe("extractString / extractStringArray / extractType", () => {
  it("仅接受非空字符串", () => {
    expect(extractString({ k: "值" }, "k")).toBe("值");
    expect(extractString({ k: "  " }, "k")).toBeUndefined();
    expect(extractString({ k: 123 }, "k")).toBeUndefined();
  });

  it("数组仅保留字符串元素", () => {
    expect(extractStringArray({ k: ["a", 1, "b", null] }, "k")).toEqual(["a", "b"]);
  });

  it("extractType 从内容解析 type", () => {
    expect(extractType("---\ntype: note\n---\n正文")).toBe("note");
    expect(extractType("无 frontmatter")).toBeUndefined();
  });
});

describe("mergeConceptContent", () => {
  it("旧正文包含新正文时保留旧正文", () => {
    const merged = mergeConceptContent(
      "---\ntype: note\n---\n# 完整内容\n部分内容",
      "---\ntype: note\n---\n部分内容",
    );
    expect(merged).toContain("# 完整内容");
    expect(merged).not.toContain("---\n\n");
  });

  it("新旧正文不相包含时用分隔线拼接", () => {
    const merged = mergeConceptContent(
      "---\ntype: note\n---\n# 旧内容",
      "---\ntype: note\n---\n# 新内容",
    );
    expect(merged).toContain("# 旧内容\n\n---\n\n# 新内容");
  });

  it("tags 合并去重，sources 按 resource 合并去重", () => {
    const merged = mergeConceptContent(
      "---\ntype: note\ntags: [a, b]\nsources:\n  - resource: x\n---\n旧",
      "---\ntype: note\ntags: [b, c]\nsources:\n  - resource: y\n---\n新",
    );
    const { frontmatter } = parseFrontmatter(merged);
    expect(frontmatter["tags"]).toEqual(["a", "b", "c"]);
    expect(frontmatter["sources"]).toHaveLength(2);
  });

  it("清除 v0.1 遗留的 provenance 与 timestamp", () => {
    const merged = mergeConceptContent(
      "---\ntype: note\nprovenance: [x]\ntimestamp: '2026'\n---\n旧",
      "---\ntype: note\n---\n新",
    );
    const { frontmatter } = parseFrontmatter(merged);
    expect(frontmatter["provenance"]).toBeUndefined();
    expect(frontmatter["timestamp"]).toBeUndefined();
  });

  it("title 与 created 保留旧值不被新值覆盖", () => {
    const merged = mergeConceptContent(
      "---\ntype: note\ntitle: 旧标题\ncreated: '2026-01-01'\n---\n旧",
      "---\ntype: note\ntitle: 新标题\n---\n新",
    );
    const { frontmatter } = parseFrontmatter(merged);
    expect(frontmatter["title"]).toBe("旧标题");
    expect(frontmatter["created"]).toBe("2026-01-01");
  });
});
