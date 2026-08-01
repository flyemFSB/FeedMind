import fs from "node:fs";
import path from "node:path";
import { extractString, parseFrontmatter, searchPages } from "@feedmind/wiki-core";
import type { WikiSearchResult } from "@feedmind/contracts";
import { client } from "@feedmind/db";
import { getSpaceDir, isSystemFile } from "./space-fs/index.js";

interface SearchablePage {
  path: string;
  title: string;
  content: string;
}

// 内存缓存：spaceId -> cached pages（用于 FTS5 不适用的短查询回退）
const pageCache = new Map<string, { pages: SearchablePage[]; timestamp: number }>();
const CACHE_DURATION = 5000; // 5 秒缓存

// ─── SQLite FTS5 索引 ────────────────────────────────────────────
// 使用 trigram 分词器：支持 CJK 子串匹配（无需分词，3 字符滑动窗口）
async function ensureFtsTables(): Promise<void> {
  await client.execute(`CREATE VIRTUAL TABLE IF NOT EXISTS wiki_fts USING fts5(
    space_id UNINDEXED, path UNINDEXED, title, content, tokenize='trigram')`);
  await client.execute(`CREATE TABLE IF NOT EXISTS wiki_fts_meta (
    space_id TEXT PRIMARY KEY, fingerprint TEXT, updated_at INTEGER)`);
}

// 目录指纹：.md 文件数 + 最大 mtime。本地文件型 wiki 无法自动感知改动，
// 用指纹对比判断索引是否需要重建（直接编辑文件或 API 操作都会改变 mtime）。
function computeFingerprint(spaceId: string): string {
  const wikiDir = path.join(getSpaceDir(spaceId), "wiki");
  if (!fs.existsSync(wikiDir)) return "";
  let count = 0;
  let maxMtime = 0;
  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.toLowerCase().endsWith(".md") && !isSystemFile(entry.name)) {
        count++;
        try {
          maxMtime = Math.max(maxMtime, fs.statSync(fullPath).mtimeMs);
        } catch {
          /* 忽略不可读文件 */
        }
      }
    }
  };
  walk(wikiDir);
  return `${count}:${maxMtime}`;
}

async function rebuildSpaceIndex(spaceId: string): Promise<void> {
  const fingerprint = computeFingerprint(spaceId);
  const meta = await client.execute({
    sql: "SELECT fingerprint FROM wiki_fts_meta WHERE space_id = ?",
    args: [spaceId],
  });
  if (meta.rows[0]?.fingerprint === fingerprint) return;

  const pages = loadSearchablePages(spaceId);
  const statements = [
    { sql: "DELETE FROM wiki_fts WHERE space_id = ?", args: [spaceId] },
    ...pages.map((p) => ({
      sql: "INSERT INTO wiki_fts (space_id, path, title, content) VALUES (?, ?, ?, ?)",
      args: [spaceId, p.path, p.title, p.content],
    })),
  ];
  await client.batch(statements);
  await client.execute({
    sql: "INSERT INTO wiki_fts_meta (space_id, fingerprint, updated_at) VALUES (?, ?, ?) ON CONFLICT(space_id) DO UPDATE SET fingerprint = excluded.fingerprint, updated_at = excluded.updated_at",
    args: [spaceId, fingerprint, Date.now()],
  });
}

function loadSearchablePages(spaceId: string): SearchablePage[] {
  const wikiDir = path.join(getSpaceDir(spaceId), "wiki");
  if (!fs.existsSync(wikiDir)) return [];

  const pages: SearchablePage[] = [];
  const loadDir = (dir: string) => {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          loadDir(fullPath);
        } else if (entry.name.toLowerCase().endsWith(".md") && !isSystemFile(entry.name)) {
          try {
            const content = fs.readFileSync(fullPath, "utf-8");
            const { frontmatter } = parseFrontmatter(content);
            const title = extractString(frontmatter, "title") ?? entry.name.replace(/\.md$/i, "");
            const relPath = path.relative(wikiDir, fullPath).replace(/\\/g, "/");
            pages.push({ path: relPath, title, content });
          } catch {
            /* skip unreadable */
          }
        }
      }
    } catch {
      /* skip */
    }
  };
  loadDir(wikiDir);
  return pages;
}

function cachedPages(spaceId: string): SearchablePage[] {
  const cacheEntry = pageCache.get(spaceId);
  if (cacheEntry && Date.now() - cacheEntry.timestamp < CACHE_DURATION) {
    return cacheEntry.pages;
  }
  const pages = loadSearchablePages(spaceId);
  pageCache.set(spaceId, { pages, timestamp: Date.now() });
  return pages;
}

function keywordSearch(
  spaceId: string,
  query: string,
  topK: number,
): { results: WikiSearchResult[]; mode: string; totalHits: number } {
  const results = searchPages(cachedPages(spaceId), query, topK);
  return { results, mode: "keyword", totalHits: results.length };
}

export async function searchWiki(
  spaceId: string,
  query: string,
  topK: number = 20,
): Promise<{ results: WikiSearchResult[]; mode: string; totalHits: number }> {
  const trimmed = query.trim();
  if (!trimmed) return { results: [], mode: "keyword", totalHits: 0 };

  // trigram 分词器要求查询至少 3 个字符（2 字符 CJK 词无法建索引匹配），过短回退内存搜索
  if ([...trimmed].length < 3) {
    return keywordSearch(spaceId, trimmed, topK);
  }

  try {
    await ensureFtsTables();
    await rebuildSpaceIndex(spaceId);

    // 引号包住查询短语做精确子串匹配（trigram 天然支持 CJK 连续片段）
    const match = `"${trimmed.replace(/"/g, '""')}"`;
    const { rows } = await client.execute({
      sql: `SELECT path, title, snippet(wiki_fts, 3, '[', ']', '…', 20) AS snip
            FROM wiki_fts
            WHERE wiki_fts MATCH ? AND space_id = ?
            ORDER BY bm25(wiki_fts, 1.0, 1.0, 8.0, 1.0) LIMIT ?`,
      args: [match, spaceId, topK],
    });

    // bm25 为负值且量级小，转换为可读的正分：标题命中加权、按相关度排序
    const results: WikiSearchResult[] = rows.map((r, i) => {
      const title = String(r.title);
      const titleMatch = title.toLowerCase().includes(trimmed.toLowerCase());
      return {
        path: String(r.path),
        title,
        snippet: String(r.snip ?? ""),
        titleMatch,
        score: (rows.length - i) * 10 + (titleMatch ? 50 : 0),
      };
    });
    return { results, mode: "keyword", totalHits: results.length };
  } catch (err) {
    // FTS5 异常时回退到内存关键词搜索，保证搜索功能可用
    console.error(
      `[wiki-search] FTS5 查询失败，回退关键词搜索: ${err instanceof Error ? err.message : String(err)}`,
    );
    return keywordSearch(spaceId, trimmed, topK);
  }
}
