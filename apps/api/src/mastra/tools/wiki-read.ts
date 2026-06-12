import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const MAX_PAGE_CHARS = 4096;

export const wikiReadTool = createTool({
  id: "wiki_read",
  description: `Read a wiki page by its slug/ID. Returns the page content with frontmatter metadata.
Use this when you need to reference existing knowledge in the wiki.
The pageId is the slug (filename without .md extension).`,
  inputSchema: z.object({
    spaceId: z.string().describe("The wiki space ID (e.g., 'my-research')."),
    pageId: z.string().describe("The page slug/ID (filename without .md)."),
  }),
  execute: async ({ spaceId, pageId }, { requestContext }) => {
    // 从 RequestContext 获取后端 API 地址
    const backendApiUrl = (requestContext?.get("backendApiUrl") as string) || "http://localhost:8000";
    const baseUrl = backendApiUrl.replace(/\/+$/, "");
    const url = `${baseUrl}/wiki/spaces/${encodeURIComponent(spaceId)}/pages/${encodeURIComponent(pageId)}`;

    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      return JSON.stringify({
        error: "WIKI_READ_FAILED",
        spaceId,
        pageId,
        status: response.status,
      });
    }

    const data = await response.json();
    const content = data.content ?? "";
    const truncated = content.length > MAX_PAGE_CHARS
      ? content.slice(0, MAX_PAGE_CHARS) + "\n\n[... content truncated ...]"
      : content;

    return [
      `Title: ${data.title}`,
      `Type: ${data.type}`,
      `Path: ${data.path}`,
      ...(data.sources?.length ? [`Sources: ${data.sources.join(", ")}`] : []),
      ...(data.tags?.length ? [`Tags: ${data.tags.join(", ")}`] : []),
      ...(data.related?.length ? [`Related: ${data.related.join(", ")}`] : []),
      "",
      truncated,
    ].join("\n");
  },
});
