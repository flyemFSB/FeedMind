import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { agentEnv } from "../env.js";

const MAX_PAGE_CHARS = 4096;

export const wikiReadTool = tool(
  async ({ spaceId, pageId }) => {
    const baseUrl = agentEnv.BACKEND_API_URL.replace(/\/+$/, "");
    const url = `${baseUrl}/wiki/spaces/${encodeURIComponent(spaceId)}/pages/${encodeURIComponent(pageId)}`;

    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`Wiki page "${pageId}" not found in space "${spaceId}" (${response.status})`);
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
  {
    name: "wiki_read",
    description: `Read a wiki page by its slug/ID. Returns the page content with frontmatter metadata.
Use this when you need to reference existing knowledge in the wiki.
The pageId is the slug (filename without .md extension).`,
    schema: z.object({
      spaceId: z.string().describe("The wiki space ID (e.g., 'my-research')."),
      pageId: z.string().describe("The page slug/ID (filename without .md)."),
    }),
  },
);
