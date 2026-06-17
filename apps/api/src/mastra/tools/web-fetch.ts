import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
import { ToolConfigClient } from "./search/config.js";
import { logger } from "../../lib/logger.js";

const turndownService = new TurndownService({
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  headingStyle: "atx",
});

const MAX_HTML_SIZE = 2 * 1024 * 1024; // 2MB：超出此大小的 HTML 直接截断避免 OOM
const MAX_OUTPUT_CHARS = 4096; // 按字符截断（非 UTF-16 code unit），避免切开多字节字符

/** 私网 IP 段正则列表（SSRF 防护） */
const PRIVATE_IPS = [
  /^127\.\d+\.\d+\.\d+$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^::1$/,
  /^fc00:/,
  /^fd00:/,
  /^fe80:/,
];
const INTERNAL_HOSTS = [
  "localhost",
  "localhost.localdomain",
  "127.0.0.1",
  "0.0.0.0",
  "[::1]",
  "internal",
];

/** 检查 hostname 是否为私网地址 */
async function checkSSRF(urlStr: string): Promise<void> {
  const url = new URL(urlStr);
  const host = url.hostname.toLowerCase();
  if (INTERNAL_HOSTS.includes(host)) throw new Error(`SSRF blocked: ${host}`);
  if (PRIVATE_IPS.some((re) => re.test(host)))
    throw new Error(`SSRF blocked: private IP (${host})`);
  // 域名则尝试 DNS 解析后检查
  if (/^[a-z]/.test(host)) {
    try {
      const { resolve4 } = await import("node:dns/promises");
      const ips = await resolve4(host);
      for (const ip of ips) {
        if (PRIVATE_IPS.some((re) => re.test(ip)) || INTERNAL_HOSTS.includes(ip)) {
          throw new Error(`SSRF blocked: ${host} resolves to private IP (${ip})`);
        }
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("SSRF blocked")) throw err;
      // DNS 解析失败时放行：实际 HTTP 请求仍会因域名不可达而失败，
      // 但能返回更准确的错误信息（如 ENOTFOUND），而非 SSRF 误报
      logger.warn({ err, host }, "DNS 解析失败，跳过 SSRF IP 检查");
    }
  }
}

/** 使用 Readability 从 HTML 中提取正文；返回 null 表示无可提取内容 */
function extractWithReadability(html: string, url: string) {
  const doc = new JSDOM(html, { url });
  const reader = new Readability(doc.window.document);
  const article = reader.parse();
  if (!article) return null;
  return { title: article.title ?? "Untitled", content: article.content ?? null };
}

/** 直接从 URL 获取原始 HTML */
async function fetchHtmlDirectly(url: string, signal: AbortSignal): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    },
    signal,
    redirect: "follow",
  });

  if (!response.ok) {
    const err = new Error(`Direct fetch returned status ${response.status} for ${url}`);
    (err as any).status = response.status;
    throw err;
  }

  return response.text();
}

/** 通过 Firecrawl API 获取 Markdown 内容 */
async function fetchViaFirecrawl(
  url: string,
  signal: AbortSignal,
  apiKey?: string,
): Promise<string | null> {
  if (!apiKey) return null;

  const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ url, formats: ["markdown"] }),
    signal,
  });

  if (!response.ok) return null;

  const body = await response.json();
  const markdown: string | undefined = body?.data?.markdown;
  return markdown?.trim() ? markdown : null;
}

/** 文章 → Markdown 格式化 */
function formatAsMarkdown(title: string, htmlContent: string | null): string {
  if (!htmlContent) return `# ${title}\n\n*No content available*\n`;
  const markdown = turndownService.turndown(htmlContent);
  return `# ${title}\n\n${markdown}`;
}

/** 按字符边界截断字符串，避免切开 surrogate pair */
function truncateByChars(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return Array.from(text).slice(0, maxChars).join("");
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
    // SSRF 防护：先验证目标地址
    await checkSSRF(url);

    // 从数据库加载工具配置（含 Firecrawl API Key）
    await ToolConfigClient.getInstance().load(abortSignal);
    const toolConfig = ToolConfigClient.getInstance().getTool("web_fetch");
    const firecrawlApiKey = toolConfig?.config?.firecrawlApiKey as string | undefined;

    // 1) 优先通过 Firecrawl 获取 Markdown
    let markdown: string | null = null;
    try {
      markdown = await fetchViaFirecrawl(url, AbortSignal.timeout(10_000), firecrawlApiKey);
    } catch (err) {
      logger.warn({ err, url }, "Firecrawl 抓取失败，切换至直接抓取");
    }

    if (markdown) {
      return truncateByChars(markdown, MAX_OUTPUT_CHARS);
    }

    // 2) 兜底：直接 HTTP 请求 + Readability + Turndown
    let html = await fetchHtmlDirectly(url, AbortSignal.timeout(5_000));

    if (html.length > MAX_HTML_SIZE) {
      html = html.slice(0, MAX_HTML_SIZE);
    }

    const article = extractWithReadability(html, url);

    if (article) {
      markdown = formatAsMarkdown(article.title, article.content);
    } else {
      markdown = formatAsMarkdown("Untitled", html);
    }

    return truncateByChars(markdown, MAX_OUTPUT_CHARS);
  },
});
