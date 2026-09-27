import { describe, expect, it } from "vitest";
import { charBigrams, jaccard, normalizeIdentityTitle } from "@feedmind/wiki-core";

describe("Dedup / Bigram 算法不变量测试", () => {
  it("满足空值与单字元安全不变量", () => {
    // 空字符串安全防护
    expect(charBigrams("")).toEqual(new Set());

    // 单字符边界防护，回退保留单字元
    expect(charBigrams("中")).toEqual(new Set(["中"]));
  });

  it("满足 Jaccard 相似度数学自反性与对称律", () => {
    const s1 = new Set(["知识", "识库", "库架"]);
    const s2 = new Set(["识库", "架构"]);

    // 自反性：非空集合自身相似度为 1.0
    expect(jaccard(s1, s1)).toBe(1.0);

    // 对称律：J(A, B) === J(B, A)
    expect(jaccard(s1, s2)).toBe(jaccard(s2, s1));

    // 零交集场景相似度为 0.0
    const s3 = new Set(["无关", "内容"]);
    expect(jaccard(s1, s3)).toBe(0.0);

    // 空集合除零安全防护
    expect(jaccard(new Set(), new Set())).toBe(0.0);
  });

  it("满足标题规范化幂等不变量", () => {
    const raw = "  FeedMind   Wiki 知识库  ";
    const normalizedOnce = normalizeIdentityTitle(raw);
    const normalizedTwice = normalizeIdentityTitle(normalizedOnce);

    // 幂等性：f(f(x)) === f(x)
    expect(normalizedOnce).toBe(normalizedTwice);
  });
});
