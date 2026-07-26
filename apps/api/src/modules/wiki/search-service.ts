import fs from "node:fs";
import path from "node:path";
import { extractString, parseFrontmatter, searchPages } from "@feedmind/wiki-core";
import type { WikiSearchResult } from "@feedmind/contracts";
import { getSpaceDir, isSystemFile } from "./space-fs/index.js";

interface SearchablePage {
  path: string;
  title: string;
  content: string;
}

// 内存缓存：spaceId -> cached pages
const pageCache = new Map<string, { pages: SearchablePage[]; timestamp: number }>();
const CACHE_DURATION = 5000; // 5 秒缓存

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

export async function searchWiki(
  spaceId: string,
  query: string,
  topK: number = 20,
): Promise<{ results: WikiSearchResult[]; mode: string; totalHits: number }> {
  // 尝试从缓存获取
  const cacheEntry = pageCache.get(spaceId);
  if (cacheEntry && Date.now() - cacheEntry.timestamp < CACHE_DURATION) {
    const pages = cacheEntry.pages;
    const results = searchPages(pages, query, topK);
    return { results, mode: "keyword", totalHits: results.length };
  }

  // 加载并缓存
  const pages = loadSearchablePages(spaceId);
  pageCache.set(spaceId, { pages, timestamp: Date.now() });

  const results = searchPages(pages, query, topK);
  return {
    results,
    mode: "keyword",
    totalHits: results.length,
  };
}
