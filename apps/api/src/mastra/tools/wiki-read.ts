import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { extractConceptLinks } from "@feedmind/wiki-core";
import { HttpError } from "../../lib/http.js";
import { getWikiPage } from "../../modules/wiki/store/page-store.js";
import { truncateForModel } from "./tool-output.js";

export const wikiReadTool = createTool({
  id: "wiki_read",
  description: "读取本地 OKF 知识库概念页正文与元数据。",
  inputSchema: z.object({
    spaceId: z.string().describe("知识库空间标识"),
    pageId: z.string().describe("概念页ID(不含.md的相对路径)"),
  }),
  outputSchema: z.string(),
  execute: async ({ spaceId, pageId }) => {
    let data;
    try {
      data = await getWikiPage(spaceId, pageId);
    } catch (err) {
      // 仅 404 页面不存在作为预期输出返回，底层异常直接上抛
      if (!(err instanceof HttpError) || err.status !== 404) throw err;
      return JSON.stringify({ error: "WIKI_PAGE_NOT_FOUND", spaceId, pageId });
    }

    const content = truncateForModel(data.content);
    const links = extractConceptLinks(data.content, data.concept_id);

    return [
      `Title: ${data.title}`,
      `Type: ${data.type}`,
      `Path: ${data.path}`,
      ...(data.description ? [`Description: ${data.description}`] : []),
      ...(data.resource ? [`Resource: ${data.resource}`] : []),
      ...(data.tags.length > 0 ? [`Tags: ${data.tags.join(", ")}`] : []),
      ...(links.length > 0 ? [`Outgoing Links: ${links.map((l) => `[[${l}]]`).join(", ")}`] : []),
      "",
      content,
    ].join("\n");
  },
});
