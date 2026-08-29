import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { ToolConfigClient } from "./search/config.js";
import { anysearchSearch } from "./search/anysearch.js";
import { tavilySearch } from "./search/tavily.js";
import { exaSearch } from "./search/exa.js";

export interface WebSearchHit {
  title: string;
  url: string;
  content: string;
}

// 成功带引擎名与结果；失败带错误码（DISABLED=未配置/停用，FAILED=全部引擎失败）
export type WebSearchResponse =
  | { error: string; query: string; message: string }
  | { query: string; engine: string; total_results: number; results: WebSearchHit[] };

/** 类型化联网搜索；Mastra 工具与管线代码共用此实现，避免各自解析 JSON 字符串 */
export async function runWebSearch(
  query: string,
  maxResults = 5,
  language?: string,
): Promise<WebSearchResponse> {
  await ToolConfigClient.getInstance().load();
  const webSearch = ToolConfigClient.getInstance().getTool("web_search");

  if (!webSearch?.is_enabled) {
    return {
      error: "WEB_SEARCH_DISABLED",
      query,
      message: "Web search is disabled",
    };
  }

  const limit = Number(maxResults);

  // 按优先级顺序尝试：Tavily → Exa → AnySearch（兜底）
  const engines: Array<{
    name: string;
    search: (
      signal: AbortSignal,
    ) => Promise<Array<{ title: string; url: string; content: string }>>;
  }> = [];

  if (webSearch.config?.["tavilyApiKey"]) {
    engines.push({
      name: "tavily",
      search: (signal) =>
        tavilySearch(query, limit, webSearch.config["tavilyApiKey"] as string, signal, language),
    });
  }
  if (webSearch.config?.["exaApiKey"]) {
    engines.push({
      name: "exa",
      search: (signal) => exaSearch(query, limit, webSearch.config["exaApiKey"] as string, signal),
    });
  }
  engines.push({
    name: "anysearch",
    search: (signal) =>
      anysearchSearch(
        query,
        limit,
        webSearch.config?.["anysearchApiKey"] as string | undefined,
        signal,
      ),
  });

  for (const engine of engines) {
    try {
      const results = await engine.search(AbortSignal.timeout(8_000));
      return { query, engine: engine.name, total_results: results.length, results };
    } catch {
      // 试下一个引擎，不提前中断
    }
  }

  return {
    error: "WEB_SEARCH_FAILED",
    query,
    message: "All search engines failed",
  };
}

export const webSearchTool = createTool({
  id: "web_search",
  description:
    "Search the web for current information, news, articles, and facts from the internet. " +
    "Note: results may merge multiple excerpts from the same source into one content field (joined by [...]).",
  inputSchema: z.object({
    query: z.string().min(1).describe("Search keywords. Be specific for better results."),
    max_results: z.coerce.number().int().min(1).max(10).default(5),
    language: z
      .string()
      .min(2)
      .max(12)
      .optional()
      .describe(
        "BCP-47 language hint to bias results (e.g. zh-Hans, en). Omit for mixed-language queries.",
      ),
  }),
  execute: async ({ query, max_results, language }) =>
    JSON.stringify(await runWebSearch(query, max_results ?? 5, language), null, 2),
});
