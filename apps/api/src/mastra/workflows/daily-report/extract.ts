import type { ExtractFeed, ExtractItem } from "@feedmind/contracts";
import { logger } from "../../../lib/logger.js";
import { extractAgent } from "../../agents/extract-agent.js";
import { fetchArticleText } from "../../tools/web-fetch.js";

// 提炼步正文上限：仅作防病态超长页的护栏，不设限长文会无界膨胀。
// 依据（2026-08 实测 8 条 feeds 全文）：中位 ~9.6k、最大 13.2k；weixin 源 description 最大 ~20k。
// 24k 覆盖实测分布 + 20% 余量，仅 >2.4 万字符的病态页被截断（上下文 1000KB 非约束，成本也可忽略）。
const EXTRACT_MAX_CHARS = 24_000;

export interface ExtractDeps {
  /** 抓取正文；默认走 fetchArticleText（SSRF 防护 + Firecrawl），上限 EXTRACT_MAX_CHARS */
  fetchText?: (url: string) => Promise<string>;
  /** LLM 摘要；默认走 extractAgent */
  summarize?: (text: string, title: string) => Promise<string>;
}

// extractAgent 纯文本输出，trim 掉首尾空白
async function defaultSummarize(text: string, title: string): Promise<string> {
  const result = await extractAgent.generate(`标题：${title}\n正文：\n${text}`);
  const summary = result.text.trim();
  if (!summary) throw new Error("摘要为空");
  return summary;
}

// 离线兜底摘要，控制旁白长度
function cleanDescription(html: string): string {
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(text).slice(0, 200).join("");
}

/**
 * 把若干待提炼条目转成"今日要点"。逐条独立处理：正文抓取或 LLM 摘要失败时
 * 回退到标题/摘要，不让单条失败中断整条日报管线。
 */
export async function buildExtractItems(
  feeds: ExtractFeed[],
  deps: ExtractDeps = {},
): Promise<ExtractItem[]> {
  const fetchText =
    deps.fetchText ?? ((url: string) => fetchArticleText(url, undefined, EXTRACT_MAX_CHARS));
  const summarize = deps.summarize ?? defaultSummarize;

  const items: ExtractItem[] = [];
  for (const feed of feeds) {
    items.push(await extractFeedItem(feed, { fetchText, summarize }));
  }
  return items;
}

async function extractFeedItem(
  feed: ExtractFeed,
  deps: Required<Pick<ExtractDeps, "fetchText" | "summarize">>,
): Promise<ExtractItem> {
  const fallback = () => ({
    title: feed.title,
    url: feed.link,
    summary: cleanDescription(feed.description ?? feed.title),
    source: feed.source,
  });

  try {
    const text = await deps.fetchText(feed.link);
    const summary = await deps.summarize(text, feed.title);
    return { title: feed.title, url: feed.link, summary, source: feed.source };
  } catch {
    // 抓取/摘要任一失败即回退；静默降级会让日报悄悄变薄，故记录告警
    logger.warn(
      { url: feed.link, title: feed.title },
      "日报提炼回退到标题/摘要（抓正文或 LLM 摘要失败）",
    );
    return fallback();
  }
}
