import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { ToolConfigClient } from "./search/config.js";
import { anysearchSearch } from "./search/anysearch.js";
import { tavilySearch } from "./search/tavily.js";
import { exaSearch } from "./search/exa.js";

export const webSearchTool = createTool({
  id: "web_search",
  description:
    "Search the web for current information, news, articles, and facts from the internet.",
  inputSchema: z.object({
    query: z.string().min(1).describe("Search keywords. Be specific for better results."),
    max_results: z.coerce.number().int().min(1).max(10).default(5),
  }),
  execute: async ({ query, max_results }) => {
    await ToolConfigClient.getInstance().load();
    const webSearch = ToolConfigClient.getInstance().getTool("web_search");

    if (!webSearch?.is_enabled) {
      return JSON.stringify({
        error: "WEB_SEARCH_DISABLED",
        query,
        message: "Web search is disabled",
      });
    }

    const limit = Number(max_results ?? 5);

    // 按优先级顺序尝试：Tavily → Exa → AnySearch（兜底）
    const engines: Array<{
      name: string;
      search: (
        signal: AbortSignal,
      ) => Promise<Array<{ title: string; url: string; content: string }>>;
    }> = [];

    if (webSearch.config?.tavilyApiKey) {
      engines.push({
        name: "tavily",
        search: (signal) =>
          tavilySearch(query, limit, webSearch.config.tavilyApiKey as string, signal),
      });
    }
    if (webSearch.config?.exaApiKey) {
      engines.push({
        name: "exa",
        search: (signal) => exaSearch(query, limit, webSearch.config.exaApiKey as string, signal),
      });
    }
    engines.push({
      name: "anysearch",
      search: (signal) =>
        anysearchSearch(
          query,
          limit,
          webSearch.config?.anysearchApiKey as string | undefined,
          signal,
        ),
    });

    for (const engine of engines) {
      try {
        const results = await engine.search(AbortSignal.timeout(8_000));
        return JSON.stringify(
          { query, engine: engine.name, total_results: results.length, results },
          null,
          2,
        );
      } catch (_error) {
        // 试下一个引擎，不提前中断
      }
    }

    return JSON.stringify({
      error: "WEB_SEARCH_FAILED",
      query,
      message: "All search engines failed",
    });
  },
});
