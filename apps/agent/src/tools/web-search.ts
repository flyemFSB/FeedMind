import { tool } from "@langchain/core/tools";
import { SafeSearchType, search } from "duck-duck-scrape";
import { z } from "zod";

// DuckDuckGo 网页搜索工具，无需 API Key，结果返回给 LLM 自行处理
// 通过 JSON 字符串传递结果，符合 LangChain tool 返回值约定
export const webSearchTool = tool(
  async ({ query, max_results }) => {
    try {
      const response = await search(query, {
        safeSearch: SafeSearchType.MODERATE,
      });
      const results = response.results.slice(0, max_results).map((result) => ({
        title: result.title ?? "",
        url: result.url ?? "",
        content: result.description ?? "",
      }));

      if (!results.length) {
        return JSON.stringify({ error: "No results found", query });
      }

      return JSON.stringify(
        {
          query,
          total_results: results.length,
          results,
        },
        null,
        2,
      );
    } catch (error) {
      // 工具失败返回 JSON 给模型处理，避免一次网络异常中断整条 LangGraph 流
      return JSON.stringify({
        error: "WEB_SEARCH_FAILED",
        query,
        message: error instanceof Error ? error.message : "Unknown search error",
      });
    }
  },
  {
    name: "web_search",
    description:
      "Search the web for current information, news, articles, and facts from the internet.",
    schema: z.object({
      query: z.string().min(1).describe("Search keywords. Be specific for better results."),
      max_results: z.number().int().min(1).max(10).default(5),
    }),
  },
);
