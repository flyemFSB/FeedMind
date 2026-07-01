import { createTool } from "@mastra/core/tools";
import { z } from "zod";

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
  execute: async ({ spaceId, query, topK }, { requestContext }) => {
    const backendApiUrl =
      (requestContext?.get("backendApiUrl") as string) || "http://localhost:18790";
    const baseUrl = backendApiUrl.replace(/\/+$/, "");
    const url = `${baseUrl}/wiki/spaces/${encodeURIComponent(spaceId)}/search`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query, topK: topK ?? 10 }),
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      return JSON.stringify({
        error: "WIKI_SEARCH_FAILED",
        spaceId,
        query,
        status: response.status,
      });
    }

    const data = (await response.json()) as {
      results?: Array<{
        title: string;
        titleMatch?: boolean;
        path: string;
        snippet: string;
        score: number;
      }>;
      totalHits?: number;
    };
    const results = data.results ?? [];

    if (results.length === 0) {
      return `No results found for "${query}".`;
    }

    const lines = [`Search results for "${query}" (${data.totalHits ?? results.length} hits):`, ""];

    for (const r of results.slice(0, topK ?? 10)) {
      lines.push(`- ${r.title}${r.titleMatch ? " [TITLE MATCH]" : ""}`);
      lines.push(`  Path: ${r.path}`);
      lines.push(`  ${r.snippet}`);
      lines.push(`  Score: ${r.score.toFixed(1)}`);
      lines.push("");
    }

    return lines.join("\n");
  },
});
