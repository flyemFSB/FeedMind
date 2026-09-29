import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { logger } from "../../lib/logger.js";
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

/** 单引擎硬超时（毫秒）：超过即换下一个引擎 */
const SEARCH_TIMEOUT_MS = 8_000;

/** 硬超时兜底：部分引擎 SDK 不接受 AbortSignal，仅靠 signal 无法中断挂起的请求 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      setTimeout(() => reject(new Error(`${label} 搜索超时（${ms}ms）`)), ms).unref();
    }),
  ]);
}

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

  const limit = maxResults;

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
      // 部分引擎 SDK 不接受 AbortSignal，必须用 race 兜底硬超时
      const results = await withTimeout(
        engine.search(AbortSignal.timeout(SEARCH_TIMEOUT_MS)),
        SEARCH_TIMEOUT_MS,
        engine.name,
      );
      return { query, engine: engine.name, total_results: results.length, results };
    } catch (err) {
      // 记录当前引擎失败原因并回退到下一个引擎
      logger.warn({ err, engine: engine.name, query }, "搜索源失败，尝试下一个");
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
  description: "搜索互联网资讯、文章与公开事实。",
  inputSchema: z.object({
    query: z.string().min(1).describe("搜索关键词"),
    max_results: z.coerce.number().int().min(1).max(10).default(5),
    language: z.string().min(2).max(12).optional().describe("语言偏好代码(如zh-Hans,en)"),
  }),
  outputSchema: z.union([
    z.object({ error: z.string(), query: z.string(), message: z.string() }),
    z.object({
      query: z.string(),
      engine: z.string(),
      total_results: z.number(),
      results: z.array(z.object({ title: z.string(), url: z.string(), content: z.string() })),
    }),
  ]),
  execute: async ({ query, max_results, language }) => runWebSearch(query, max_results, language),
});
