import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { HttpError } from "../../lib/http.js";
import { getWikiPage } from "../../modules/wiki/store/page-store.js";
import { truncateForModel } from "./tool-output.js";

export const wikiReadTool = createTool({
  id: "wiki_read",
  description: `Read an OKF concept by its Concept ID. Returns the Markdown body and frontmatter metadata.
Use this when you need to reference existing knowledge in the wiki.
The pageId is the bundle-relative path without the .md extension, such as "tables/orders".`,
  inputSchema: z.object({
    spaceId: z.string().describe("The wiki space ID (e.g., 'my-research')."),
    pageId: z.string().describe("The OKF Concept ID, a bundle-relative path without .md."),
  }),
  outputSchema: z.string().describe("Concept metadata header plus Markdown body."),
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

    return [
      `Title: ${data.title}`,
      `Type: ${data.type}`,
      `Path: ${data.path}`,
      ...(data.description ? [`Description: ${data.description}`] : []),
      ...(data.resource ? [`Resource: ${data.resource}`] : []),
      ...(data.tags.length > 0 ? [`Tags: ${data.tags.join(", ")}`] : []),
      "",
      content,
    ].join("\n");
  },
});
