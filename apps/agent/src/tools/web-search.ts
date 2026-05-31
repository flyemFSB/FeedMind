import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { SearchConfigClient } from "./search/config.js";
import { braveSearch } from "./search/brave.js";
import { tavilySearch } from "./search/tavily.js";
import { exaSearch } from "./search/exa.js";

async function searchWeb({ query, max_results }: { query: string; max_results: number }) {
  const config = SearchConfigClient.instance.get();

  let results: Array<{ title: string; url: string; content: string }>;
  let engine = "";

  if (config.braveApiKey) {
    engine = "brave";
    results = await braveSearch(query, max_results, config.braveApiKey);
  } else if (config.tavilyApiKey) {
    engine = "tavily";
    results = await tavilySearch(query, max_results, config.tavilyApiKey);
  } else if (config.exaApiKey) {
    engine = "exa";
    results = await exaSearch(query, max_results, config.exaApiKey);
  } else {
    return JSON.stringify({ error: "No search engine configured" });
  }

  return JSON.stringify(
    { query, engine, total_results: results.length, results },
    null,
    2,
  );
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
