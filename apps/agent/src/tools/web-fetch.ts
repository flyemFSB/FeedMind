import { tool } from "@langchain/core/tools";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
import { z } from "zod";
import { ToolConfigClient } from "./search/config.js";

// 初始化 Turndown（HTML → Markdown 转换器）
const turndownService = new TurndownService({
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  headingStyle: "atx",
});

// 按 Unicode grapheme cluster 边界截断字符串
const segmenter = typeof Intl?.Segmenter === "function"
  ? new Intl.Segmenter("en", { granularity: "grapheme" })
  : null;

const MAX_HTML_SIZE = 2 * 1024 * 1024; // 2MB：超出此大小的 HTML 直接截断避免 OOM
const MAX_OUTPUT_CHARS = 4096; // 按字符截断（非 UTF-16 code unit），避免切开多字节字符

// 使用 Readability 从 HTML 中提取正文；返回 null 表示无可提取内容
function extractWithReadability(html: string, url: string) {
  const doc = new JSDOM(html, { url });
  const reader = new Readability(doc.window.document);
  const article = reader.parse();
  if (!article) return null;
  return { title: article.title ?? "Untitled", content: article.content ?? null };
}

// 按 Unicode 字符边界截断字符串，避免切开 surrogate pair 或 combining mark
function truncateByChars(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;

  if (segmenter) {
    let result = "";
    for (const { segment } of segmenter.segment(text)) {
      if (result.length + segment.length > maxChars) break;
      result += segment;
    }
    return result;
  }

  // 兜底：按 Unicode code point 截断
  return Array.from(text).slice(0, maxChars).join("");
}

// 直接从 URL 获取原始 HTML（不通过 Jina）
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

  const text = await response.text();
  if (!text.trim()) {
    const err = new Error("Direct fetch returned empty response");
    (err as any).status = 0;
    throw err;
  }

  return text;
}

// 通过 Jina API 获取 HTML；jinaApiKey 为空时走匿名模式
async function fetchHtmlViaJina(
  url: string,
  signal: AbortSignal,
  jinaApiKey?: string,
): Promise<string | null> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    // 服务端超时设短一点，给客户端 AbortSignal 留缓冲，避免网络开销吃掉 Jina 处理时间
    "X-Return-Format": "html",
    "X-Timeout": "8",
  };
  if (jinaApiKey) {
    headers.Authorization = `Bearer ${jinaApiKey}`;
  }

  const response = await fetch("https://r.jina.ai/", {
    method: "POST",
    headers,
    body: JSON.stringify({ url }),
    signal,
  });

  if (!response.ok) {
    return null; // 非 2xx 触发兜底
  }

  const text = await response.text();
  return text.trim() ? text : null;
}

// 文章 → Markdown 格式化；htmlContent 为 null 时表示无内容
function formatAsMarkdown(title: string, htmlContent: string | null): string {
  if (!htmlContent) {
    return `# ${title}\n\n*No content available*\n`;
  }
  const markdown = turndownService.turndown(htmlContent);
  return `# ${title}\n\n${markdown}`;
}

export const webFetchTool = tool(
  async ({ url }) => {
    try {
      // 从数据库加载工具配置（含 Jina API Key）
      await ToolConfigClient.instance.load();
      const toolConfig = ToolConfigClient.instance.getTool("web_fetch");
      const jinaApiKey = toolConfig?.config?.jinaApiKey as string | undefined;

      // 1) 优先通过 Jina 获取 HTML（附带频率限制，但有 JS 渲染能力）
      //    内层 try/catch：Jina 网络异常时仍可降级到直接 fetch
      const jinaSignal = AbortSignal.timeout(10_000);
      let html: string | null = null;

      try {
        html = await fetchHtmlViaJina(url, jinaSignal, jinaApiKey);
      } catch (err) {
        // Jina 异常（超时、DNS 失败等）→ 降级到直接 fetch
        console.warn("[web_fetch] Jina fetch failed, falling back to direct fetch:", err instanceof Error ? err.message : err);
      }

      if (!html) {
        // 2) Jina 兜底方案：直接 HTTP 请求原始 HTML + Readability
        const directSignal = AbortSignal.timeout(8_000); // 兜底超时缩短，避免 18s+
        html = await fetchHtmlDirectly(url, directSignal);
      }

      // 防止超大 HTML 导致 JSDOM OOM
      if (html.length > MAX_HTML_SIZE) {
        html = html.slice(0, MAX_HTML_SIZE);
      }

      // 3) 用 Readability 提取正文
      const article = extractWithReadability(html, url);

      let markdown: string;
      if (article) {
        markdown = formatAsMarkdown(article.title, article.content);
      } else {
        // Readability 无法提取正文（非文章类页面）→ 直接用 Turndown 转原始 HTML
        const rawMarkdown = turndownService.turndown(html);
        markdown = `# Untitled\n\n${rawMarkdown}`;
      }

      // 4) 按字符边界截断，避免切开多字节字符
      return truncateByChars(markdown, MAX_OUTPUT_CHARS);
    } catch (error) {
      // 工具失败返回给模型处理，避免一次网络异常中断整条 LangGraph 流
      return JSON.stringify({
        error: "WEB_FETCH_FAILED",
        url,
        status: error instanceof Error && "status" in error ? (error as any).status : 500,
        message: error instanceof Error ? error.message : "Unknown fetch error",
      });
    }
  },
  {
    name: "web_fetch",
    description: `Fetch the contents of a web page at a given URL.
Use this tool when you need the full text content of a page — articles, blog posts, documentation, etc.
Only fetch EXACT URLs that have been provided directly by the user or returned by web_search.
URLs must include the schema (https://example.com, not example.com).`,
    schema: z.object({
      url: z.string().url().describe("The exact URL to fetch. Must include http:// or https://."),
    }),
  },
);
