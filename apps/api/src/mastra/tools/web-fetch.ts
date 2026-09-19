import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { ToolConfigClient } from "./search/config.js";
import { truncateForModel } from "./tool-output.js";
import { logger } from "../../lib/logger.js";

import { checkSSRF } from "../../lib/ssrf.js";
export { checkSSRF };

// 提取 Firecrawl v2 响应中的 markdown 字段
const firecrawlResponseSchema = z.object({
  data: z
    .object({
      markdown: z.string().optional(),
    })
    .optional(),
});

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
      "Firecrawl 网页抓取失败",
    );
    return null;
  }

  const rawJson = (await response.json().catch(() => null)) as unknown;
  const parsed = firecrawlResponseSchema.safeParse(rawJson);
  const markdown = parsed.success ? parsed.data.data?.markdown : undefined;
  return markdown?.trim() ? markdown : null;
}

/** 抓取网页正文：执行 SSRF 校验、Firecrawl 抓取与内容截断 */
export async function fetchArticleText(
  url: string,
  signal?: AbortSignal,
  maxChars?: number,
): Promise<string> {
  await checkSSRF(url);

  // 从数据库加载工具配置（含 Firecrawl API Key，可选）
  await ToolConfigClient.getInstance().load();
  const toolConfig = ToolConfigClient.getInstance().getTool("web_fetch");
  const firecrawlApiKey = toolConfig?.config?.["firecrawlApiKey"] as string | undefined;

  // 抓取走 Firecrawl v2（无 API Key 时自动使用匿名模式，有免费额度）。
  // 15s 是兑底上限，与调用方的中止信号取并集：用户点“停止”要能真的打断抓取
  const timeout = AbortSignal.timeout(15_000);
  const markdown = await fetchViaFirecrawl(
    url,
    signal ? AbortSignal.any([signal, timeout]) : timeout,
    firecrawlApiKey,
  );

  if (markdown) {
    return truncateForModel(markdown, maxChars);
  }

  throw new Error(`无法抓取页面内容: ${url}，请检查 URL 是否正确或稍后重试。`);
}

export const webFetchTool = createTool({
  id: "web_fetch",
  description: `Fetch the contents of a web page at a given URL.
Use this tool when you need the full text content of a page — articles, blog posts, documentation, etc.
Only fetch EXACT URLs that have been provided directly by the user or returned by web_search.
URLs must include the schema (https://example.com, not example.com).
Very long pages are truncated with a “[... 已省略 N 字符 ...]” marker, keeping both head and tail.`,
  inputSchema: z.object({
    url: z.url().describe("The exact URL to fetch. Must include http:// or https://."),
  }),
  outputSchema: z.string().describe("Page content as Markdown (possibly truncated)."),
  execute: async ({ url }, { abortSignal }) => {
    return fetchArticleText(url, abortSignal);
  },
});
