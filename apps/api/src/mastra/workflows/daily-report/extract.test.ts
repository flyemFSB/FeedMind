import { describe, expect, it } from "vitest";
import type { ExtractFeed } from "@feedmind/contracts";
import { buildExtractItems } from "./extract.js";

const feed: ExtractFeed = {
  title: "标题A",
  link: "https://example.com/a",
  description: "<p>描述A</p>",
  source: "来源A",
};

describe("buildExtractItems", () => {
  it("正文 + 结构化提炼正常时产出完整证据条目", async () => {
    const items = await buildExtractItems([feed], {
      fetchText: async () => "正文内容",
      extractEvidence: async (_text, title) => ({
        summary: `摘要：${title}`,
        facts: ["事实1", "事实2"],
        quotes: ["原话引语"],
        keyContext: "背景上下文",
      }),
      searchBackground: async () => undefined,
    });
    expect(items).toEqual([
      {
        title: "标题A",
        url: "https://example.com/a",
        source: "来源A",
        summary: "摘要：标题A",
        facts: ["事实1", "事实2"],
        quotes: ["原话引语"],
        keyContext: "背景上下文",
      },
    ]);
  });

  it("前 2 条重点条目会调用 searchBackground 补充背景", async () => {
    let searchedQuery = "";
    const items = await buildExtractItems([feed], {
      fetchText: async () => "正文",
      searchBackground: async (q) => {
        searchedQuery = q;
        return "外部搜索到的背景";
      },
      extractEvidence: async (_text, _title, background) => ({
        summary: "摘要",
        facts: ["事实"],
        quotes: [],
        keyContext: background ?? "",
      }),
    });
    expect(searchedQuery).toBe("标题A");
    expect(items[0]?.keyContext).toBe("外部搜索到的背景");
  });

  it("提炼失败时回退到 description（去 HTML 标签）并提供空数组默认值", async () => {
    const items = await buildExtractItems([feed], {
      fetchText: async () => "正文",
      extractEvidence: async () => {
        throw new Error("LLM 不可用");
      },
      searchBackground: async () => undefined,
    });
    expect(items[0]).toEqual({
      title: "标题A",
      url: "https://example.com/a",
      source: "来源A",
      summary: "描述A",
      facts: [],
      quotes: [],
      keyContext: "",
    });
  });

  it("抓正文失败（如 SSRF 拦截）时回退到 description", async () => {
    const items = await buildExtractItems([feed], {
      fetchText: async () => {
        throw new Error("SSRF blocked");
      },
      extractEvidence: async () => {
        throw new Error("不应走到");
      },
      searchBackground: async () => undefined,
    });
    expect(items[0]?.summary).toBe("描述A");
    expect(items[0]?.facts).toEqual([]);
  });

  it("无 description 时回退到 title", async () => {
    const items = await buildExtractItems([{ ...feed, description: null }], {
      fetchText: async () => {
        throw new Error("失败");
      },
      searchBackground: async () => undefined,
    });
    expect(items[0]?.summary).toBe("标题A");
    expect(items[0]?.facts).toEqual([]);
  });

  it("多条依次处理，单条失败不影响其他", async () => {
    const items = await buildExtractItems(
      [feed, { ...feed, title: "标题B", link: "https://example.com/b", description: "描述B" }],
      {
        fetchText: async (url) => (url.includes("/a") ? "正文A" : "正文B"),
        extractEvidence: async (_text, title) => ({
          summary: `摘要${title}`,
          facts: [`事实${title}`],
          quotes: [],
          keyContext: "",
        }),
        searchBackground: async () => undefined,
      },
    );
    expect(items).toHaveLength(2);
    expect(items[1]?.summary).toBe("摘要标题B");
    expect(items[1]?.facts).toEqual(["事实标题B"]);
  });
});
