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

    const engines: Array<{
      name: string;
      search: () => Promise<Array<{ title: string; url: string; content: string }>>;
    }> = [];

    if (webSearch?.is_enabled && webSearch.config?.tavilyApiKey) {
      engines.push({
        name: "tavily",
        search: () => tavilySearch(query, max_results, webSearch.config.tavilyApiKey as string),
      });
    }
    if (webSearch?.is_enabled && webSearch.config?.exaApiKey) {
      engines.push({
        name: "exa",
        search: () => exaSearch(query, max_results, webSearch.config.exaApiKey as string),
      });
    }
    engines.push({
      name: "anysearch",
      search: () => anysearchSearch(query, max_results, webSearch?.config?.anysearchApiKey as string | undefined),
    });

    const failures: string[] = [];
    for (const engine of engines) {
      try {
        const results = await engine.search();
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
