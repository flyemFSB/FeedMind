import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { searchWiki } from "../../modules/wiki/search-service.js";

export const wikiSearchTool = createTool({
  id: "wiki_search",
  description: `Search wiki pages by keyword. Uses keyword-based search with CJK bigram support.
Returns matching pages with snippets and relevance scores.
Use this when you need to find information across the wiki.`,
  inputSchema: z.object({
    spaceId: z.string().describe("The wiki space ID (e.g., 'my-research')."),
    query: z.string().describe("The keyword search query."),
    topK: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("Number of results to return (default 10)."),
  }),
  execute: async ({ spaceId, query, topK }) => {
    try {
      const data = await searchWiki(spaceId, query, topK ?? 10);
      const results = data.results ?? [];

      if (results.length === 0) {
        return `No results found for "${query}".`;
      }

      const lines = [
        `Search results for "${query}" (${data.totalHits ?? results.length} hits):`,
        "",
      ];

      for (const r of results.slice(0, topK ?? 10)) {
        lines.push(`- ${r.title}${r.titleMatch ? " [TITLE MATCH]" : ""}`);
        lines.push(`  Path: ${r.path}`);
        lines.push(`  ${r.snippet}`);
        lines.push(`  Score: ${r.score.toFixed(1)}`);
        lines.push("");
      }

      return lines.join("\n");
    } catch {
      return JSON.stringify({
        error: "WIKI_SEARCH_FAILED",
        spaceId,
        query,
      });
    }
  },
});
