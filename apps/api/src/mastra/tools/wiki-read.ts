import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getWikiPage } from "../../modules/wiki/store/page-store.js";

const MAX_PAGE_CHARS = 4096;

export const wikiReadTool = createTool({
  id: "wiki_read",
  description: `Read an OKF concept by its Concept ID. Returns the Markdown body and frontmatter metadata.
Use this when you need to reference existing knowledge in the wiki.
The pageId is the bundle-relative path without the .md extension, such as "tables/orders".`,
  inputSchema: z.object({
    spaceId: z.string().describe("The wiki space ID (e.g., 'my-research')."),
    pageId: z.string().describe("The OKF Concept ID, a bundle-relative path without .md."),
  }),
  execute: async ({ spaceId, pageId }) => {
    try {
      const data = await getWikiPage(spaceId, pageId);
      const content = data.content ?? "";
      const truncated =
        content.length > MAX_PAGE_CHARS
          ? content.slice(0, MAX_PAGE_CHARS) + "\n\n[... content truncated ...]"
          : content;

      return [
        `Title: ${data.title}`,
        `Type: ${data.type}`,
        `Path: ${data.path}`,
        ...(data.description ? [`Description: ${data.description}`] : []),
        ...(data.resource ? [`Resource: ${data.resource}`] : []),
        ...(data.tags && data.tags.length > 0 ? [`Tags: ${data.tags.join(", ")}`] : []),
        "",
        truncated,
      ].join("\n");
    } catch {
      return JSON.stringify({
        error: "WIKI_PAGE_NOT_FOUND",
        spaceId,
        pageId,
      });
    }
  },
});
