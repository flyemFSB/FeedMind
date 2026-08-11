import { describe, expect, it } from "vitest";
import type { LintPage } from "./lint.js";
import { runOkfLint } from "./lint.js";

const BUNDLE = "/wiki";
const page = (relPath: string, content: string): LintPage => ({
  path: `${BUNDLE}/${relPath}`,
  content,
});

const concept = (body: string, extra: Record<string, unknown> = {}) =>
  `---\ntype: concept\n${Object.entries(extra)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join("\n")}\n---\n\n${body}`;

describe("runOkfLint", () => {
  it("合法 bundle 无 conformance 警告，仅提示孤儿与无出链", () => {
    const results = runOkfLint(
      [
        page("index.md", '---\nokf_version: "0.2"\n---\n\n# 首页\n'),
        page("a.md", concept("[B](b.md)")),
        page("b.md", concept("内容")),
      ],
      BUNDLE,
    );
    expect(results.filter((r) => r.type === "conformance" || r.type === "broken-link")).toEqual([]);
    expect(results.some((r) => r.type === "orphan" && r.page === "a.md")).toBe(true);
    expect(results.some((r) => r.type === "no-outlinks" && r.page === "b.md")).toBe(true);
  });

  it("index.md 含多余字段或非根位置时告警", () => {
    const results = runOkfLint(
      [
        page("index.md", "---\nokf_version: 0.2\ntitle: 非法\n---\n\n# 首页"),
        page("nested/index.md", '---\nokf_version: "0.2"\n---\n\n# 嵌套'),
      ],
      BUNDLE,
    );
    expect(results.some((r) => r.page === "index.md" && r.type === "conformance")).toBe(true);
    expect(results.some((r) => r.page === "nested/index.md" && r.type === "conformance")).toBe(
      true,
    );
  });

  it("index.md 缺 Markdown 标题时告警", () => {
    const results = runOkfLint(
      [page("index.md", '---\nokf_version: "0.2"\n---\n\n纯文本')],
      BUNDLE,
    );
    expect(results.some((r) => r.page === "index.md" && /标题/.test(r.detail))).toBe(true);
  });

  it("log.md 不应含 frontmatter，日期应按最新在前", () => {
    const results = runOkfLint(
      [page("log.md", "---\nfoo: bar\n---\n\n## 2026-08-08\n## 2026-08-09\n")],
      BUNDLE,
    );
    expect(results.some((r) => r.page === "log.md" && /frontmatter/.test(r.detail))).toBe(true);
    expect(results.some((r) => r.page === "log.md" && /最新日期在前/.test(r.detail))).toBe(true);
  });

  it("Concept 缺 type 时告警", () => {
    const results = runOkfLint([page("a.md", "---\ntitle: 无类型\n---\n正文")], BUNDLE);
    expect(results.some((r) => r.page === "a.md" && /type/.test(r.detail))).toBe(true);
  });

  it("指向不存在页面的链接报 broken-link", () => {
    const results = runOkfLint([page("a.md", concept("[不存在](ghost.md)"))], BUNDLE);
    expect(results.some((r) => r.type === "broken-link" && /ghost/.test(r.detail))).toBe(true);
  });

  it("仍使用 timestamp 且无 generated 时提示迁移", () => {
    const results = runOkfLint(
      [page("a.md", concept("正文", { timestamp: "2026-01-01" }))],
      BUNDLE,
    );
    expect(results.some((r) => /generated/.test(r.detail) && /timestamp/.test(r.detail))).toBe(
      true,
    );
  });

  it("已使用 generated 则不再提示迁移", () => {
    const results = runOkfLint(
      [
        page(
          "a.md",
          concept("正文", { timestamp: "2026-01-01", generated: { by: "x", at: "2026-02-01" } }),
        ),
      ],
      BUNDLE,
    );
    expect(results.some((r) => /generated/.test(r.detail))).toBe(false);
  });
});
