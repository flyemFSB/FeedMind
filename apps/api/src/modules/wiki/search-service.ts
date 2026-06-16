import fs from "node:fs";
import path from "node:path";
import { searchPages, parseFrontmatter } from "@feedmind/wiki-core";
import type { WikiSearchResult } from "@feedmind/contracts";
import { spaceDir } from "./wiki-utils.js";

interface SearchablePage {
  path: string;
  title: string;
  content: string;
}

function loadSearchablePages(spaceId: string): SearchablePage[] {
  const wikiDir = path.join(spaceDir(spaceId), "wiki");
  if (!fs.existsSync(wikiDir)) return [];

  const pages: SearchablePage[] = [];
  const loadDir = (dir: string) => {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          loadDir(fullPath);
        } else if (entry.name.endsWith(".md")) {
          try {
            const content = fs.readFileSync(fullPath, "utf-8");
            const { frontmatter } = parseFrontmatter(content);
            const title = (frontmatter.title as string) ?? entry.name.replace(/\.md$/, "");
            const relPath = path.relative(spaceDir(spaceId), fullPath).replace(/\\/g, "/");
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
  const pages = loadSearchablePages(spaceId);
  const results = searchPages(pages, query, topK);

  return {
    results,
    mode: "keyword",
    totalHits: results.length,
  };
}
