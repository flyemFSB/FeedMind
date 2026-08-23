import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { ToolConfigClient } from "./search/config.js";
import { logger } from "../../lib/logger.js";

const MAX_OUTPUT_CHARS = 4096; // 按字符截断（非 UTF-16 code unit），避免切开多字节字符

import { checkSSRF } from "../../lib/ssrf.js";
export { checkSSRF };

/** 通过 Firecrawl v2 API 获取 Markdown 内容（支持匿名模式） */
async function fetchViaFirecrawl(
  url: string,
  signal: AbortSignal,
  apiKey?: string,
): Promise<string | null> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const response = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers,
    body: JSON.stringify({ url, formats: ["markdown"] }),
    signal,
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    logger.warn(
      { status: response.status, body: errBody.slice(0, 200), url },
      "Firecrawl 抓取失败",
    );
    return null;
  }

  const rawJson = (await response.json().catch(() => null)) as unknown;
  const firecrawlResponseSchema = z.object({
    data: z
      .object({
        markdown: z.string().optional(),
      })
      .optional(),
  });
  const parsed = firecrawlResponseSchema.safeParse(rawJson);
  const markdown = parsed.success ? parsed.data.data?.markdown : undefined;
  return markdown?.trim() ? markdown : null;
}

/** 按字符边界截断字符串，避免切开 surrogate pair */
function truncateByChars(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return Array.from(text).slice(0, maxChars).join("");
}

/**
 * 抓取网页正文（SSRF 防护 + Firecrawl + 截断）。供 web_fetch 工具与日报提炼步共用，
 * 保证所有外部 URL 抓取走同一套防护。maxChars 控制返回长度上限：
 * web_fetch 工具为聊天上下文节约，默认 4096；日报提炼步传入更大上限以覆盖正文主体。
 */
export async function fetchArticleText(
  url: string,
  signal?: AbortSignal,
  maxChars: number = MAX_OUTPUT_CHARS,
): Promise<string> {
  await checkSSRF(url);

  // 从数据库加载工具配置（含 Firecrawl API Key，可选）
  await ToolConfigClient.getInstance().load(signal ?? AbortSignal.timeout(5_000));
  const toolConfig = ToolConfigClient.getInstance().getTool("web_fetch");
  const firecrawlApiKey = toolConfig?.config?.["firecrawlApiKey"] as string | undefined;

  // 通过 Firecrawl v2 抓取（无 API Key 时自动使用匿名模式，有免费额度）
  const markdown = await fetchViaFirecrawl(url, AbortSignal.timeout(15_000), firecrawlApiKey);

  if (markdown) {
    return truncateByChars(markdown, maxChars);
  }

  throw new Error(`无法抓取页面内容: ${url}，请检查 URL 是否正确或稍后重试。`);
}

export const webFetchTool = createTool({
  id: "web_fetch",
  description: `Fetch the contents of a web page at a given URL.
Use this tool when you need the full text content of a page — articles, blog posts, documentation, etc.
Only fetch EXACT URLs that have been provided directly by the user or returned by web_search.
URLs must include the schema (https://example.com, not example.com).`,
  inputSchema: z.object({
    url: z.string().url().describe("The exact URL to fetch. Must include http:// or https://."),
  }),
  execute: async ({ url }, { abortSignal }) => {
    return fetchArticleText(url, abortSignal);
  },
});
