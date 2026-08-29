import type { ExtractEvidence, ExtractFeed, ExtractItem } from "@feedmind/contracts";
import { extractEvidenceSchema } from "@feedmind/contracts";
import { logger } from "../../../lib/logger.js";
import { extractAgent } from "../../agents/extract-agent.js";
import { fetchArticleText } from "../../tools/web-fetch.js";
import { runWebSearch } from "../../tools/web-search.js";

// 提炼步正文上限：仅作防病态超长页的护栏，不设限长文会无界膨胀。
// 依据（2026-08 实测 8 条 feeds 全文）：中位 ~9.6k、最大 13.2k；weixin 源 description 最大 ~20k。
// 24k 覆盖实测分布 + 20% 余量，仅 >2.4 万字符的病态页被截断（上下文 1000KB 非约束，成本也可忽略）。
const EXTRACT_MAX_CHARS = 24_000;

export interface ExtractDeps {
  /** 抓取正文；默认走 fetchArticleText（SSRF 防护 + Firecrawl），上限 EXTRACT_MAX_CHARS */
  fetchText?: (url: string) => Promise<string>;
  /** 结构化提炼；默认走 extractAgent + structuredOutput */
  extractEvidence?: (text: string, title: string, background?: string) => Promise<ExtractEvidence>;
  /** 检索外部背景；默认走 runWebSearch（对重点条目查询一次） */
  searchBackground?: (query: string) => Promise<string | undefined>;
}

// 重点条目（前 2 条）尝试一次定向搜索补充外部背景
async function defaultSearchBackground(query: string): Promise<string | undefined> {
  try {
    const res = await runWebSearch(`${query} 背景 影响`, 3);
    if ("error" in res || res.results.length === 0) return undefined;
    return res.results
      .map((r) => `【${r.title}】: ${r.content}`)
      .join("\n")
      .slice(0, 1200);
  } catch {
    return undefined;
  }
}

async function defaultExtractEvidence(
  text: string,
  title: string,
  background?: string,
): Promise<ExtractEvidence> {
  let prompt = `标题：${title}\n正文：\n${text}`;
  if (background) {
    prompt += `\n\n补充外部背景资讯（供参考）：\n${background}`;
  }
  const result = await extractAgent.generate(prompt, {
    structuredOutput: { schema: extractEvidenceSchema },
  });
  return result.object;
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
 * 把若干待提炼条目转成携带完整证据链的"今日要点"。
 * 逐条独立处理：对前 2 条重点条目定向补搜背景；正文抓取或 LLM 提炼失败时
 * 安全回退到标题/描述，不让单条失败中断整条日报管线。
 */
export async function buildExtractItems(
  feeds: ExtractFeed[],
  deps: ExtractDeps = {},
): Promise<ExtractItem[]> {
  const fetchText =
    deps.fetchText ?? ((url: string) => fetchArticleText(url, undefined, EXTRACT_MAX_CHARS));
  const extractEvidence = deps.extractEvidence ?? defaultExtractEvidence;
  const searchBackground = deps.searchBackground ?? defaultSearchBackground;

  const items: ExtractItem[] = [];
  for (let i = 0; i < feeds.length; i++) {
    const feed = feeds[i]!;
    let background: string | undefined;
    if (i < 2) {
      try {
        background = await searchBackground(feed.title);
      } catch {
        // 搜索失败不影响后续提取
      }
    }
    items.push(await extractFeedItem(feed, background, { fetchText, extractEvidence }));
  }
  return items;
}

async function extractFeedItem(
  feed: ExtractFeed,
  background: string | undefined,
  deps: Required<Pick<ExtractDeps, "fetchText" | "extractEvidence">>,
): Promise<ExtractItem> {
  const fallback = (): ExtractItem => ({
    title: feed.title,
    url: feed.link,
    source: feed.source,
    summary: cleanDescription(feed.description ?? feed.title),
    facts: [],
    quotes: [],
    keyContext: "",
  });

  try {
    const text = await deps.fetchText(feed.link);
    const evidence = await deps.extractEvidence(text, feed.title, background);
    return {
      title: feed.title,
      url: feed.link,
      source: feed.source,
      summary: evidence.summary || cleanDescription(feed.description ?? feed.title),
      facts: evidence.facts ?? [],
      quotes: evidence.quotes ?? [],
      keyContext: evidence.keyContext ?? "",
    };
  } catch {
    logger.warn(
      { url: feed.link, title: feed.title },
      "日报提炼回退到标题/摘要（抓正文或 LLM 提炼失败）",
    );
    return fallback();
  }
}
