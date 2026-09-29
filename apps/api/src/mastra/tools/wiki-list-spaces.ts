import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { listWikiSpaces } from "../../modules/wiki/space-registry.js";

export const wikiListSpacesTool = createTool({
  id: "wiki_list_spaces",
  description: "列出本地所有 OKF 知识库空间及其元数据（空间 ID、名称、概念页数量等）。",
  inputSchema: z.object({
    q: z.string().optional().describe("可选的空间名称过滤关键词"),
  }),
  outputSchema: z.string(),
  execute: async ({ q }) => {
    let spaces = await listWikiSpaces();
    if (q?.trim()) {
      const keyword = q.trim().toLowerCase();
      spaces = spaces.filter(
        (s) => s.name.toLowerCase().includes(keyword) || s.id.toLowerCase().includes(keyword),
      );
    }

    if (spaces.length === 0) {
      return q ? `未找到匹配 "${q}" 的知识库空间。` : "当前未创建任何知识库空间。";
    }

    const lines = [`本地知识库空间列表 (共 ${spaces.length} 个):`, ""];
    for (const s of spaces) {
      lines.push(`- ${s.name} (ID: ${s.id})`);
      lines.push(`  概念页数: ${s.page_count} | 资料源数: ${s.source_count} | 模板: ${s.template}`);
      if (s.updated_at) lines.push(`  更新时间: ${s.updated_at}`);
      lines.push("");
    }

    return lines.join("\n").trim();
  },
});
