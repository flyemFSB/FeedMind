import fs from "node:fs";
import path from "node:path";
import { parseFrontmatter } from "@feedmind/wiki-core";
import { readDirRecursive, readFileSafe } from "./io.js";
import { getWikiDir, getSpaceDir, getScopedWikiDir, TYPE_DIR_MAP } from "./paths.js";

const CACHE_TTL_MS = 60_000;
const pageFileCache = new Map<string, { data: Map<string, string>; ts: number }>();

function getSlugCache(spaceId: string): Map<string, string> {
  const entry = pageFileCache.get(spaceId);
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) return entry.data;
  const cache = new Map<string, string>();
  try {
    const files = readDirRecursive(getWikiDir(spaceId), (_f, name) => name.endsWith(".md"));
    for (const f of files) {
      cache.set(path.basename(f, ".md"), f);
    }
  } catch {
    /* dir not created yet */
  }
  pageFileCache.set(spaceId, { data: cache, ts: Date.now() });
  return cache;
}

export function invalidatePageCache(spaceId: string): void {
  pageFileCache.delete(spaceId);
}

export function findPageBySlug(spaceId: string, slug: string): string | null {
  return getSlugCache(spaceId).get(slug) ?? null;
}

function inferTypeFromDir(relDir: string): string {
  const parts = relDir.replace(/\\/g, "/").split("/");
  const wikiIdx = parts.indexOf("wiki");
  if (wikiIdx >= 0 && wikiIdx + 1 < parts.length) {
    const sub = parts[wikiIdx + 1];
    return TYPE_DIR_MAP[sub] ?? (sub ? "concept" : "overview");
  }
  return wikiIdx >= 0 ? "overview" : "concept";
}

export function walkPages(spaceId: string, typeFilter?: string): string[] {
  const scanDir = getScopedWikiDir(spaceId, typeFilter);
  try {
    return readDirRecursive(scanDir, (_f, name) => name.endsWith(".md"));
  } catch {
    return [];
  }
}

export function readPage(filePath: string, spaceId: string): Record<string, unknown> | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const { frontmatter, body } = parseFrontmatter(content);
    const relPath = path.relative(getSpaceDir(spaceId), filePath).replace(/\\/g, "/");
    const slug = path.basename(filePath, ".md");
    const pageType = (frontmatter.type as string) || inferTypeFromDir(relPath) || "concept";
    return {
      id: slug,
      space_id: spaceId,
      path: relPath,
      slug,
      type: pageType,
      title: (frontmatter.title as string) ?? slug,
      content: body.trim(),
      frontmatter: frontmatter as Record<string, unknown>,
      sources: (frontmatter.sources as string[]) ?? [],
      tags: (frontmatter.tags as string[]) ?? [],
      related: (frontmatter.related as string[]) ?? [],
      created_at: (frontmatter.created as string) ?? "",
      updated_at: (frontmatter.updated as string) ?? "",
    };
  } catch {
    return null;
  }
}

export function readPageListItem(
  filePath: string,
  spaceId: string,
): Record<string, unknown> | null {
  const read = readPage(filePath, spaceId);
  if (!read) return null;
  return {
    id: read.id,
    space_id: read.space_id,
    path: read.path,
    slug: read.slug,
    type: read.type,
    title: read.title,
    tags: read.tags,
    created_at: read.created_at,
    updated_at: read.updated_at,
  };
}

export function readPageRaw(filePath: string): string | null {
  return readFileSafe(filePath);
}
