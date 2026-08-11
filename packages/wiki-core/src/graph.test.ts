import { describe, expect, it } from "vitest";
import type { FileNode } from "./graph.js";
import { buildWikiGraph } from "./graph.js";

const BUNDLE = "/wiki";
const file = (relPath: string, _content: string): FileNode => ({
  name: relPath.split("/").at(-1) ?? relPath,
  path: `${BUNDLE}/${relPath}`,
  is_dir: false,
});
const dir = (relPath: string): FileNode => ({
  name: relPath.split("/").at(-1) ?? relPath,
  path: `${BUNDLE}/${relPath}`,
  is_dir: true,
});

const concept = (title: string, body: string) => `---\ntype: note\ntitle: ${title}\n---\n\n${body}`;

describe("buildWikiGraph", () => {
  it("构建节点与去重边，跳过 index/log/目录/非 md/不可读文件", async () => {
    const readFileFn = async (p: string): Promise<string> => {
      const map: Record<string, string> = {
        [`${BUNDLE}/a.md`]: concept("A", "[B](b.md) [自身](a.md) [外部](https://x.com)"),
        [`${BUNDLE}/b.md`]: concept("B", "内容"),
        [`${BUNDLE}/c.md`]: concept("C", "[A](a.md) [A](a.md)"), // 重复边
      };
      const content = map[p];
      if (!content) throw new Error("unreadable");
      return content;
    };

    const { nodes, edges } = await buildWikiGraph(
      readFileFn,
      [
        file("index.md", "# 首页"),
        file("log.md", "## 2026-08-09"),
        file("a.md", ""),
        file("b.md", ""),
        file("c.md", ""),
        dir("docs"),
        file("skip.txt", "x"),
        file("unreadable.md", ""),
      ],
      BUNDLE,
    );

    expect(nodes.map((n) => n.id).sort()).toEqual(["a", "b", "c"]);
    // a→b、c→a、a→b（重复合并为一条）；自身链接与外部链接被过滤
    expect(edges).toHaveLength(2);
    expect(edges).toContainEqual({ source: "a", target: "b", weight: 1 });
    expect(edges).toContainEqual({ source: "c", target: "a", weight: 1 });
  });

  it("标题缺省时回退到文件名，linkCount 累计入链出链", async () => {
    const contents: Record<string, string> = {
      [`${BUNDLE}/alpha.md`]: "---\ntype: note\n---\n\n内容",
      [`${BUNDLE}/beta.md`]: "---\ntype: note\n---\n\n[Alpha](alpha.md)",
    };
    const readFileFn = async (p: string): Promise<string> => {
      const c = contents[p];
      if (!c) throw new Error("unreadable");
      return c;
    };
    const { nodes } = await buildWikiGraph(
      readFileFn,
      [file("alpha.md", ""), file("beta.md", "")],
      BUNDLE,
    );
    const alpha = nodes.find((n) => n.id === "alpha");
    const beta = nodes.find((n) => n.id === "beta");
    expect(alpha?.label).toBe("alpha");
    expect(alpha?.linkCount).toBe(1); // 收到 beta 的入链
    expect(beta?.linkCount).toBe(1); // beta 出链指向 alpha
  });
});
