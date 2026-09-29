import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { listWikiPages } from "../../modules/wiki/store/page-store.js";
import { getWikiSpace } from "../../modules/wiki/space-registry.js";

export const wikiListPagesTool = createTool({
  id: "wiki_list_pages",
  description: "列出指定知识库空间内的概念页文件清单与目录分类。",
  inputSchema: z.object({
    spaceId: z.string().describe("知识库空间标识"),
    type: z
      .string()
      .optional()
      .describe(
        "可选的概念类型过滤（如 Concept, Method, Technology, Application, Trend, Reference 等）",
      ),
    limit: z.number().int().min(1).max(100).optional().describe("返回条数(默认50)"),
    offset: z.number().int().min(0).optional().describe("分页偏移量(默认0)"),
  }),
  outputSchema: z.string(),
  execute: async ({ spaceId, type, limit, offset }) => {
    const [space, { items, total }] = await Promise.all([
      getWikiSpace(spaceId).catch(() => null),
      listWikiPages(spaceId, {
        ...(type ? { type } : {}),
        limit: limit ?? 50,
        offset: offset ?? 0,
      }),
    ]);

    const spaceName = space?.name ?? spaceId;
    if (items.length === 0) {
      return `知识库 [${spaceName} (${spaceId})] 中暂无${type ? ` 类型为 "${type}" 的` : ""}概念页。`;
    }

    const start = (offset ?? 0) + 1;
    const end = Math.min((offset ?? 0) + items.length, total);
    const lines = [
      `知识库 [${spaceName} (${spaceId})] 概念页清单 (共 ${total} 篇, 当前展示 ${start}-${end}):`,
      "",
    ];

    for (const item of items) {
      lines.push(`- ${item.concept_id} [${item.type}]`);
      lines.push(`  标题: ${item.title}`);
      lines.push(`  路径: ${item.path}`);
      if (item.tags && item.tags.length > 0) {
        lines.push(`  标签: ${item.tags.join(", ")}`);
      }
      if (item.description) {
        lines.push(`  说明: ${item.description}`);
      }
      lines.push("");
    }

    return lines.join("\n").trim();
  },
});
