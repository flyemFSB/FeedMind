import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { ToolConfigClient } from "./search/config.js";
import { anysearchSearch } from "./search/anysearch.js";
import { tavilySearch } from "./search/tavily.js";
import { exaSearch } from "./search/exa.js";

async function searchWeb({ query, max_results }: { query: string; max_results: number }) {
  try {
    await ToolConfigClient.instance.load();
    const webSearch = ToolConfigClient.instance.getTool("web_search");

    if (!webSearch?.is_enabled) {
      throw new Error("Web search is disabled");
    }

    // 按优先级顺序尝试：Tavily → Exa → AnySearch（兜底）
    // 前面的引擎成功后立即返回，不触发后续引擎，避免浪费付费 API 额度
    const engines: Array<{
      name: string;
      search: (signal: AbortSignal) => Promise<Array<{ title: string; url: string; content: string }>>;
    }> = [];

    if (webSearch?.is_enabled && webSearch.config?.tavilyApiKey) {
      engines.push({
        name: "tavily",
        search: (signal) => tavilySearch(query, max_results, webSearch.config.tavilyApiKey as string, signal),
      });
    }
    if (webSearch?.is_enabled && webSearch.config?.exaApiKey) {
      engines.push({
        name: "exa",
        search: (signal) => exaSearch(query, max_results, webSearch.config.exaApiKey as string, signal),
      });
    }
    engines.push({
      name: "anysearch",
      search: (signal) => anysearchSearch(query, max_results, webSearch?.config?.anysearchApiKey as string | undefined, signal),
    });

    const failures: string[] = [];
    for (const engine of engines) {
      try {
        // 每个引擎独立 8s 超时，避免慢引擎阻塞整条降级链
        const results = await engine.search(AbortSignal.timeout(8_000));
        return JSON.stringify(
          { query, engine: engine.name, total_results: results.length, results },
          null,
          2,
        );
      } catch (error) {
        failures.push(`${engine.name}: ${error instanceof Error ? error.message : "Unknown search error"}`);
      }
    }

    throw new Error(failures.join("; "));
  } catch (error) {
    return JSON.stringify({
      error: "WEB_SEARCH_FAILED",
      query,
      message: error instanceof Error ? error.message : "Unknown search error",
    });
  }
}

export const webSearchTool = tool(searchWeb, {
  name: "web_search",
  description:
    "Search the web for current information, news, articles, and facts from the internet.",
  schema: z.object({
    query: z.string().min(1).describe("Search keywords. Be specific for better results."),
    max_results: z.number().int().min(1).max(10).default(5),
  }),
});
