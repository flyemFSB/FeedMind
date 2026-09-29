import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { searchWiki } from "../../modules/wiki/search/search-service.js";

export const wikiSearchTool = createTool({
  id: "wiki_search",
  description: "在本地 OKF 知识库中根据关键词检索概念页。",
  inputSchema: z.object({
    spaceId: z.string().describe("知识库空间标识"),
    query: z.string().describe("搜索关键词"),
    topK: z.number().int().min(1).max(50).optional().describe("返回结果数量(默认10)"),
  }),
  outputSchema: z.string(),
  execute: async ({ spaceId, query, topK }) => {
    // 检索异常直接上抛，避免静默掩盖底层故障
    const data = await searchWiki(spaceId, query, topK ?? 10);
    const results = data.results;

    if (results.length === 0) {
      return `No results found for "${query}".`;
    }

    const lines = [`Search results for "${query}" (${data.totalHits} hits):`, ""];

    for (const r of results) {
      lines.push(`- ${r.title}${r.titleMatch ? " [TITLE MATCH]" : ""}`);
      lines.push(`  Path: ${r.path}`);
      lines.push(`  ${r.snippet}`);
      lines.push(`  Score: ${r.score.toFixed(1)}`);
      lines.push("");
    }

    return lines.join("\n");
  },
});
