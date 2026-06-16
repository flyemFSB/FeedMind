import type { WikiSearchResult } from "@feedmind/contracts";

const SNIPPET_CONTEXT = 80;

const STOP_WORDS = new Set([
  "的",
  "是",
  "了",
  "什么",
  "在",
  "有",
  "和",
  "与",
  "对",
  "从",
  "the",
  "is",
  "a",
  "an",
  "what",
  "how",
  "are",
  "was",
  "were",
  "do",
  "does",
  "did",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "it",
  "its",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "this",
  "that",
  "these",
  "those",
]);

/**
 * 将搜索查询分词为可检索的 token。
 * 处理中日韩文（CJK）二元分词。
 */
export function tokenizeQuery(query: string): string[] {
  const rawTokens = query
    .toLowerCase()
    .split(/[\s,，。！？、；：""''（）()\-_/\\·~～…]+/)
    .filter((t) => t.length > 1)
    .filter((t) => !STOP_WORDS.has(t));

  const tokens: string[] = [];
  for (const token of rawTokens) {
    const hasCJK = /[一-鿿㐀-䶿]/.test(token);
    if (hasCJK && token.length > 2) {
      const chars = [...token];
      for (let i = 0; i < chars.length - 1; i++) tokens.push(chars[i] + chars[i + 1]);
      for (const ch of chars) {
        if (!STOP_WORDS.has(ch)) tokens.push(ch);
      }
      tokens.push(token);
    } else {
      tokens.push(token);
    }
  }
  return [...new Set(tokens)];
}

/** 用于搜索的页面内容 */
export interface SearchablePage {
  path: string;
  title: string;
  content: string;
}

/** 按关键词搜索 Wiki 页面 */
export function searchPages(
  pages: SearchablePage[],
  query: string,
  topK: number = 20,
): WikiSearchResult[] {
  if (!query.trim()) return [];

  const tokens = tokenizeQuery(query);
  const effectiveTokens = tokens.length > 0 ? tokens : [query.trim().toLowerCase()];
  const queryPhrase = query.trim().toLowerCase();

  const results: WikiSearchResult[] = [];

  for (const page of pages) {
    const titleLower = page.title.toLowerCase();
    const contentLower = page.content.toLowerCase();
    const stem = page.path.split("/").pop()?.replace(/\.md$/, "").toLowerCase() ?? "";

    const filenameExact = stem === queryPhrase || stem === queryPhrase.replace(/\s+/g, "-");
    const titleHasPhrase = titleLower.includes(queryPhrase);
    const contentPhraseOcc = countOccurrences(contentLower, queryPhrase);

    let titleTokenScore = 0;
    let contentTokenScore = 0;
    for (const token of effectiveTokens) {
      if (titleLower.includes(token)) titleTokenScore++;
      if (contentLower.includes(token)) contentTokenScore++;
    }

    if (
      !filenameExact &&
      !titleHasPhrase &&
      contentPhraseOcc === 0 &&
      titleTokenScore === 0 &&
      contentTokenScore === 0
    ) {
      continue;
    }

    const score =
      (filenameExact ? 200 : 0) +
      (titleHasPhrase ? 50 : 0) +
      Math.min(contentPhraseOcc, 10) * 20 +
      titleTokenScore * 5 +
      contentTokenScore;

    const snippetAnchor =
      contentPhraseOcc > 0
        ? queryPhrase
        : (effectiveTokens.find((t) => contentLower.includes(t)) ?? queryPhrase);

    const snippet = buildSnippet(page.content, snippetAnchor);

    results.push({
      path: page.path,
      title: page.title,
      snippet,
      titleMatch: titleTokenScore > 0 || titleHasPhrase,
      score,
    });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count++;
    idx += needle.length;
  }
  return count;
}

function buildSnippet(content: string, query: string): string {
  const lower = content.toLowerCase();
  const q = query.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx === -1) return content.slice(0, SNIPPET_CONTEXT * 2).replace(/\n/g, " ") + "...";

  const start = Math.max(0, idx - SNIPPET_CONTEXT);
  const end = Math.min(content.length, idx + q.length + SNIPPET_CONTEXT);

  let snippet = content.slice(start, end).replace(/\n/g, " ");
  if (start > 0) snippet = "..." + snippet;
  if (end < content.length) snippet = snippet + "...";
  return snippet;
}
