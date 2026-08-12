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
  it("正文 + 摘要正常时产出完整条目", async () => {
    const items = await buildExtractItems([feed], {
      fetchText: async () => "正文内容",
      summarize: async (_text, title) => `摘要：${title}`,
    });
    expect(items).toEqual([
      { title: "标题A", url: "https://example.com/a", summary: "摘要：标题A", source: "来源A" },
    ]);
  });

  it("摘要失败时回退到 description（去 HTML 标签）", async () => {
    const items = await buildExtractItems([feed], {
      fetchText: async () => "正文",
      summarize: async () => {
        throw new Error("LLM 不可用");
      },
    });
    expect(items[0]?.summary).toBe("描述A");
  });

  it("抓正文失败（如 SSRF 拦截）时回退到 description", async () => {
    const items = await buildExtractItems([feed], {
      fetchText: async () => {
        throw new Error("SSRF blocked");
      },
      summarize: async () => "不应走到",
    });
    expect(items[0]?.summary).toBe("描述A");
  });

  it("无 description 时回退到 title", async () => {
    const items = await buildExtractItems([{ ...feed, description: null }], {
      fetchText: async () => {
        throw new Error("失败");
      },
    });
    expect(items[0]?.summary).toBe("标题A");
  });

  it("多条依次处理，单条失败不影响其他", async () => {
    const items = await buildExtractItems(
      [feed, { ...feed, title: "标题B", link: "https://example.com/b", description: "描述B" }],
      {
        fetchText: async (url) => (url.includes("/a") ? "正文A" : "正文B"),
        summarize: async (_text, title) => `摘要${title}`,
      },
    );
    expect(items).toHaveLength(2);
    expect(items[1]?.summary).toBe("摘要标题B");
  });
});
