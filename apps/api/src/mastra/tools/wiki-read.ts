import { createTool } from "@mastra/core/tools";
import { z } from "zod";

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
  execute: async ({ spaceId, pageId }, { requestContext }) => {
    const backendApiUrl =
      (requestContext?.get("backendApiUrl") as string) || "http://localhost:18790";
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

    const data = (await response.json()) as Record<string, unknown>;
    const content = (data["content"] as string) ?? "";
    const truncated =
      content.length > MAX_PAGE_CHARS
        ? content.slice(0, MAX_PAGE_CHARS) + "\n\n[... content truncated ...]"
        : content;

    return [
      `Title: ${data["title"] as string}`,
      `Type: ${data["type"] as string}`,
      `Path: ${data["path"] as string}`,
      ...((data["description"] as string | undefined)
        ? [`Description: ${data["description"] as string}`]
        : []),
      ...((data["resource"] as string | null | undefined)
        ? [`Resource: ${data["resource"] as string}`]
        : []),
      ...((data["tags"] as string[] | undefined)?.length
        ? [`Tags: ${(data["tags"] as string[]).join(", ")}`]
        : []),
      "",
      truncated,
    ].join("\n");
  },
});
