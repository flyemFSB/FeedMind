import { describe, expect, it } from "vitest";
import {
  buildHandleTable,
  charBigrams,
  decodeHandleLinks,
  jaccard,
  normalizeIdentityTitle,
  resolveDedupTargets,
  resolveHandlePath,
} from "./dedup.js";
import type { ExistingPageMeta } from "./dedup.js";

const pages: ExistingPageMeta[] = [
  {
    id: "concepts/rag",
    title: "检索增强生成",
    description: "RAG 一种结合检索与生成的方法",
    type: "Technology",
  },
  {
    id: "concepts/transformer",
    title: "Transformer",
    description: "注意力架构",
    type: "Technology",
  },
  {
    id: "concepts/acme",
    title: "Acme Corp",
    description: "示例公司",
    type: "Reference",
  },
];

describe("normalizeIdentityTitle", () => {
  it("去空白并小写，保留标点", () => {
    expect(normalizeIdentityTitle("Acme  Corp")).toBe("acmecorp");
    expect(normalizeIdentityTitle("《寓言》")).toBe("《寓言》");
  });
});

describe("charBigrams / jaccard", () => {
  it("CJK 与 Latin 都能产生 bigram", () => {
    expect(charBigrams("检索")).toEqual(new Set(["检索"]));
    expect(charBigrams("acme").has("ac")).toBe(true);
  });

  it("jaccard 交并比", () => {
    expect(jaccard(new Set(["a", "b"]), new Set(["b", "c"]))).toBeCloseTo(1 / 3);
    expect(jaccard(new Set(), new Set(["a"]))).toBe(0);
  });
});

describe("resolveDedupTargets", () => {
  it("规范化标题精确命中 → boundId", () => {
    const targets = resolveDedupTargets([{ name: "Acme  Corp" }], pages);
    expect(targets[0]?.boundId).toBe("concepts/acme");
  });

  it("无命中且无相似 → candidates 为空", () => {
    const targets = resolveDedupTargets([{ name: "完全无关的东西xyz" }], pages);
    expect(targets[0]?.boundId).toBeNull();
    expect(targets[0]?.candidates).toEqual([]);
  });

  it("相似实体进入候选", () => {
    const targets = resolveDedupTargets([{ name: "检索增强生成模型" }], pages);
    expect(targets[0]?.candidates.some((c) => c.id === "concepts/rag")).toBe(true);
  });
});

describe("handle table", () => {
  const table = buildHandleTable(pages);

  it("稳定编号", () => {
    expect(table.map((h) => h.ref)).toEqual(["ref-1", "ref-2", "ref-3"]);
    expect(table[0]?.id).toBe("concepts/acme"); // 按 localeCompare 升序排列：acme < rag < transformer
  });

  it("resolveHandlePath 映射 ref，非 ref 原样", () => {
    expect(resolveHandlePath("ref-1", table)).toBe("concepts/acme.md");
    expect(resolveHandlePath("ref-1.md", table)).toBe("concepts/acme.md");
    expect(resolveHandlePath("concepts/new.md", table)).toBe("concepts/new.md");
  });

  it("decodeHandleLinks 只替换 ref 链接", () => {
    const content = "见 [公司](ref-3) 与 [新页](concepts/new.md)。参考 [RAG](ref-1.md)。";
    const decoded = decodeHandleLinks(content, table);
    expect(decoded).toContain("(/concepts/transformer.md)");
    expect(decoded).toContain("(concepts/new.md)");
    expect(decoded).toContain("(/concepts/acme.md)");
  });
});
