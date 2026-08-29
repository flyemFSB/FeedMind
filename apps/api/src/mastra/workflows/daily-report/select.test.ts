import { describe, expect, it } from "vitest";
import type { ExtractFeed } from "@feedmind/contracts";
import { selectFeeds } from "./select.js";

function mockFeed(index: number): ExtractFeed {
  return {
    id: `feed-${index}`,
    title: `新闻标题 ${index}`,
    link: `https://example.com/${index}`,
    description: `这是新闻 ${index} 的简述`,
    source: "来源A",
  };
}

describe("selectFeeds", () => {
  it("输入 <= 5 条时直接全量放行，不触发 LLM 评估", async () => {
    const feeds = [mockFeed(1), mockFeed(2), mockFeed(3)];
    let evaluated = false;
    const result = await selectFeeds(feeds, {
      evaluate: async () => {
        evaluated = true;
        return { selectedIndices: [0], reasoning: "" };
      },
    });
    expect(evaluated).toBe(false);
    expect(result).toHaveLength(3);
  });

  it("输入 > 5 条时按评估选中的序号返回精选列表", async () => {
    const feeds = Array.from({ length: 12 }, (_, i) => mockFeed(i));
    const result = await selectFeeds(feeds, {
      evaluate: async () => ({
        selectedIndices: [2, 5, 7, 9, 11],
        reasoning: "这 5 条最具代表性",
      }),
    });
    expect(result).toHaveLength(5);
    expect(result[0]?.title).toBe("新闻标题 2");
    expect(result[4]?.title).toBe("新闻标题 11");
  });

  it("评估抛错时安全回退截取前 8 条", async () => {
    const feeds = Array.from({ length: 15 }, (_, i) => mockFeed(i));
    const result = await selectFeeds(feeds, {
      evaluate: async () => {
        throw new Error("LLM 超时");
      },
    });
    expect(result).toHaveLength(8);
    expect(result[0]?.title).toBe("新闻标题 0");
    expect(result[7]?.title).toBe("新闻标题 7");
  });

  it("评估结果去重并过滤越界序号，最多返回 8 条", async () => {
    const feeds = Array.from({ length: 12 }, (_, i) => mockFeed(i));
    const result = await selectFeeds(feeds, {
      evaluate: async () => ({
        selectedIndices: [0, 1, 1, 2, 3, 4, 5, 6, 7, 8, 99],
        reasoning: "",
      }),
    });
    expect(result).toHaveLength(8);
    expect(result.map((r) => r.title)).toEqual([
      "新闻标题 0",
      "新闻标题 1",
      "新闻标题 2",
      "新闻标题 3",
      "新闻标题 4",
      "新闻标题 5",
      "新闻标题 6",
      "新闻标题 7",
    ]);
  });
});
