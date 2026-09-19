import path from "node:path";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { extractString, parseFrontmatter, searchPages, segmentChinese } from "@feedmind/wiki-core";
import type { WikiSearchResult } from "@feedmind/contracts";
import { client, ensureWikiFtsTables } from "@feedmind/db";
import { logger } from "../../../lib/logger.js";
import { getSpaceDir, isSystemFile, readDirRecursive } from "../space-fs/index.js";

interface SearchablePage {
  path: string;
  title: string;
  content: string;
}

// 空间文件指纹缓存节流时长（毫秒），避免频繁扫描磁盘
const FP_TTL_MS = 5000;
const fpCache = new Map<string, { fingerprint: string; checkedAt: number }>();

// 页面内容内存缓存：按空间文件指纹失效
const pageCache = new Map<string, { pages: SearchablePage[]; fingerprint: string }>();

// 确保初始化 Wiki 全文检索虚表与元数据表
async function ensureFtsTables(): Promise<void> {
  await ensureWikiFtsTables(client);
}

/** 计算 Wiki 目录指纹（文件数与最新修改时间戳），用于检测内容变更 */
async function computeFingerprint(spaceId: string): Promise<string> {
  const now = Date.now();
  const cached = fpCache.get(spaceId);
  if (cached && now - cached.checkedAt < FP_TTL_MS) return cached.fingerprint;

  const wikiDir = path.join(getSpaceDir(spaceId), "wiki");
  if (!existsSync(wikiDir)) return "";

  const mdFiles = readDirRecursive(
    wikiDir,
    (_f, name) => name.toLowerCase().endsWith(".md") && !isSystemFile(name),
  );
  const stats = await Promise.all(mdFiles.map((f) => stat(f).catch(() => null)));
  let count = 0;
  let maxMtime = 0;
  for (const s of stats) {
    if (!s) continue;
    count++;
    maxMtime = Math.max(maxMtime, s.mtimeMs);
  }
  const fingerprint = `${count}:${maxMtime}`;
  fpCache.set(spaceId, { fingerprint, checkedAt: now });
  return fingerprint;
}

async function rebuildSpaceIndex(spaceId: string): Promise<void> {
  const fingerprint = await computeFingerprint(spaceId);
  const meta = await client.execute({
    sql: "SELECT fingerprint FROM wiki_fts_meta WHERE space_id = ?",
    args: [spaceId],
  });
  if (meta.rows[0]?.["fingerprint"] === fingerprint) return;

  const pages = await loadSearchablePages(spaceId);
  const statements = [
    { sql: "DELETE FROM wiki_fts WHERE space_id = ?", args: [spaceId] },
    ...pages.map((p) => ({
      sql: "INSERT INTO wiki_fts (space_id, path, raw_title, title, content) VALUES (?, ?, ?, ?, ?)",
      args: [spaceId, p.path, p.title, segmentChinese(p.title), segmentChinese(p.content)],
    })),
  ];
  await client.batch(statements);
  await client.execute({
    sql: "INSERT INTO wiki_fts_meta (space_id, fingerprint, updated_at) VALUES (?, ?, ?) ON CONFLICT(space_id) DO UPDATE SET fingerprint = excluded.fingerprint, updated_at = excluded.updated_at",
    args: [spaceId, fingerprint, Date.now()],
  });
}

// 读取页面内容异步化（Promise.all 并行），避免大 wiki 全量同步读盘阻塞事件循环
async function loadSearchablePages(spaceId: string): Promise<SearchablePage[]> {
  const wikiDir = path.join(getSpaceDir(spaceId), "wiki");
  if (!existsSync(wikiDir)) return [];

  const mdFiles = readDirRecursive(
    wikiDir,
    (_f, name) => name.toLowerCase().endsWith(".md") && !isSystemFile(name),
  );
  const loaded = await Promise.all(
    mdFiles.map(async (fullPath) => {
      try {
        const content = await readFile(fullPath, "utf-8");
        const { frontmatter } = parseFrontmatter(content);
        const title =
          extractString(frontmatter, "title") ?? path.basename(fullPath).replace(/\.md$/i, "");
        const relPath = path.relative(wikiDir, fullPath).replace(/\\/g, "/");
        return { path: relPath, title, content } as SearchablePage;
      } catch {
        return null; // 不可读文件不进索引，缺失页面由 lint 单独报告
      }
    }),
  );
  return loaded.filter((p): p is SearchablePage => p !== null);
}

async function cachedPages(spaceId: string): Promise<SearchablePage[]> {
  const fingerprint = await computeFingerprint(spaceId);
  const entry = pageCache.get(spaceId);
  if (entry?.fingerprint === fingerprint) return entry.pages;
  const pages = await loadSearchablePages(spaceId);
  pageCache.set(spaceId, { pages, fingerprint });
  return pages;
}

async function keywordSearch(
  spaceId: string,
  query: string,
  topK: number,
): Promise<{ results: WikiSearchResult[]; mode: string; totalHits: number }> {
  const results = searchPages(await cachedPages(spaceId), query, topK);
  return { results, mode: "keyword", totalHits: results.length };
}

export async function searchWiki(
  spaceId: string,
  query: string,
  topK: number = 20,
): Promise<{ results: WikiSearchResult[]; mode: string; totalHits: number }> {
  const trimmed = query.trim();
  if (!trimmed) return { results: [], mode: "keyword", totalHits: 0 };

  const segQuery = segmentChinese(trimmed);
  const tokens = segQuery
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  if (tokens.length === 0) {
    return keywordSearch(spaceId, trimmed, topK);
  }

  try {
    await ensureFtsTables();
    await rebuildSpaceIndex(spaceId);

    // 各分词单元以双引号包住，进行精确短语/词匹配
    const match = tokens.map((t) => `"${t.replace(/"/g, '""')}"`).join(" ");
    const { rows } = await client.execute({
      sql: `SELECT path, raw_title AS title, snippet(wiki_fts, 4, '[', ']', '…', 20) AS snip
            FROM wiki_fts
            WHERE wiki_fts MATCH ? AND space_id = ?
            ORDER BY bm25(wiki_fts, 1.0, 1.0, 8.0, 1.0) LIMIT ?`,
      args: [match, spaceId, topK],
    });

    // bm25 为负值且量级小，转换为可读的正分：标题命中加权、按相关度排序
    const results: WikiSearchResult[] = rows.map((r, i) => {
      const title = String(r["title"] ?? "");
      const titleMatch = title.toLowerCase().includes(trimmed.toLowerCase());
      const rawSnippet = String(r["snip"] ?? "");
      // 闭合 CJK 字符间由分词器注入的额外空白，保持展示视觉自然流畅
      const snippet = rawSnippet.replace(/([\u4e00-\u9fa5\]])\s+([\u4e00-\u9fa5[])/g, "$1$2");
      return {
        path: String(r["path"]),
        title,
        snippet,
        titleMatch,
        score: (rows.length - i) * 10 + (titleMatch ? 50 : 0),
      };
    });
    return { results, mode: "keyword", totalHits: results.length };
  } catch (err) {
    // FTS5 异常时回退到内存关键词搜索，保证搜索功能可用
    logger.error({ err }, "FTS5 全文索引检索失败，回退至关键词匹配模式");
    return keywordSearch(spaceId, trimmed, topK);
  }
}
