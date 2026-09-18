// 去重预过滤 + 路径句柄：让 LLM 少犯 ID 错误。
// 相似度算法对齐 WeKnora wiki_ingest_dedup.go（char-bigram Jaccard），
// 去掉 Redis/pg_trgm，纯内存即可。

export interface ExistingPageMeta {
  id: string;
  title: string;
  description: string;
  type: string;
}

export interface DedupCandidate {
  id: string;
  title: string;
  score: number;
}

export interface DedupTarget {
  name: string;
  /** 规范化标题精确命中的已有 Concept；null 表示需 LLM 判定或新建 */
  boundId: string | null;
  candidates: DedupCandidate[];
}

export interface ConceptHandle {
  ref: string;
  id: string;
  title: string;
  type: string;
  description: string;
}

const DEDUP_TOP_K = 5;
const DEDUP_SCORE_FLOOR = 0.08;

/** 去空白 + 小写。保留标点（「寓言」与《寓言》应可区分）。 */
export function normalizeIdentityTitle(title: string): string {
  return title.replace(/\s+/g, "").toLowerCase();
}

/** 字符 bigram 集；单字符退化为 1-gram。CJK/Latin 通用。 */
export function charBigrams(s: string): Set<string> {
  const cleaned = [...s.toLowerCase()].filter((c) => /[\p{L}\p{N}]/u.test(c)).join("");
  if (!cleaned) return new Set();
  const chars = [...cleaned];
  if (chars.length === 1) return new Set(chars);
  const out = new Set<string>();
  for (let i = 0; i < chars.length - 1; i++) out.add(chars[i]! + chars[i + 1]!);
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * 为分析产出的实体/概念挑选候选。
 * 精确命中 → boundId（权威）；否则 bigram top-K + 分数下限。
 */
export function resolveDedupTargets(
  items: Array<{ name: string }>,
  existingPages: ExistingPageMeta[],
): DedupTarget[] {
  if (items.length === 0) return [];
  const pageGrams = existingPages.map((p) => ({
    page: p,
    identity: normalizeIdentityTitle(p.title),
    grams: charBigrams(`${p.title} ${p.description}`),
  }));

  return items.map((item) => {
    const identity = normalizeIdentityTitle(item.name);
    const exact = pageGrams.find((g) => g.identity === identity);
    if (exact) {
      return { name: item.name, boundId: exact.page.id, candidates: [] };
    }

    const itemGrams = charBigrams(item.name);
    const scored = pageGrams
      .map((g) => ({ id: g.page.id, title: g.page.title, score: jaccard(itemGrams, g.grams) }))
      .filter((c) => c.score >= DEDUP_SCORE_FLOOR)
      .sort((x, y) => y.score - x.score)
      .slice(0, DEDUP_TOP_K);
    return { name: item.name, boundId: null, candidates: scored };
  });
}

/** 按 id 稳定排序后编号，保证同一 bundle 多次调用句柄一致。 */
export function buildHandleTable(pages: ExistingPageMeta[]): ConceptHandle[] {
  return [...pages]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((p, i) => ({
      ref: `ref-${i + 1}`,
      id: p.id,
      title: p.title,
      type: p.type,
      description: p.description,
    }));
}

/** path 字段里的 ref-N 映射回真实路径；非 ref 原样返回（新建路径）。concept ID 无 .md，补上以通过 normalizeConceptPath。 */
export function resolveHandlePath(rawPath: string, table: ConceptHandle[]): string {
  const trimmed = rawPath.trim();
  const handle = table.find((h) => h.ref === trimmed || h.ref === trimmed.replace(/\.md$/i, ""));
  if (!handle) return trimmed;
  return handle.id.toLowerCase().endsWith(".md") ? handle.id : `${handle.id}.md`;
}

/**
 * 把正文 Markdown 链接目标里的 ref-N 换成真实绝对路径。
 * 只处理 `(ref-N)` / `(ref-N.md)`，不动普通路径/URL。
 */
export function decodeHandleLinks(content: string, table: ConceptHandle[]): string {
  if (!content || table.length === 0) return content;
  const byRef = new Map(table.map((h) => [h.ref, h.id]));
  return content.replace(/\((ref-\d+)(?:\.md)?\)/g, (match, ref: string) => {
    const id = byRef.get(ref);
    if (!id) return match;
    const encoded = id
      .split("/")
      .map((seg) => encodeURIComponent(seg))
      .join("/");
    return `(/${encoded}.md)`;
  });
}
