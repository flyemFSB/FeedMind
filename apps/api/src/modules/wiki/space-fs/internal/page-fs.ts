import fs from "node:fs";
import path from "node:path";
import {
  conceptIdFromPath,
  extractString,
  extractStringArray,
  normalizeConceptId,
  parseFrontmatter,
} from "@feedmind/wiki-core";
import { readDirRecursive, readFileSafe, isSystemFile } from "./io.js";
import { getWikiDir } from "./paths.js";

const CACHE_TTL_MS = 60_000;
const pageFileCache = new Map<string, { data: Map<string, string>; ts: number }>();

function getPageIndex(spaceId: string): Map<string, string> {
  const entry = pageFileCache.get(spaceId);
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) return entry.data;

  const index = new Map<string, string>();
  const wikiDir = getWikiDir(spaceId);
  const files = readDirRecursive(
    wikiDir,
    (_filePath, name) => name.toLowerCase().endsWith(".md") && !isSystemFile(name),
  );
  for (const filePath of files) {
    const relativePath = path.relative(wikiDir, filePath).replace(/\\/g, "/");
    index.set(conceptIdFromPath(relativePath), filePath);
  }

  pageFileCache.set(spaceId, { data: index, ts: Date.now() });
  return index;
}

export function invalidatePageCache(spaceId: string): void {
  pageFileCache.delete(spaceId);
}

export function findPageById(spaceId: string, conceptId: string): string | null {
  let decoded = conceptId;
  try {
    decoded = decodeURIComponent(conceptId);
  } catch {
    /* 路由参数不是编码值时直接使用原文。 */
  }
  return getPageIndex(spaceId).get(normalizeConceptId(decoded)) ?? null;
}

export function walkPages(spaceId: string): string[] {
  return readDirRecursive(
    getWikiDir(spaceId),
    (_filePath, name) => name.toLowerCase().endsWith(".md") && !isSystemFile(name),
  );
}

export function readPage(filePath: string, spaceId: string): Record<string, unknown> | null {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const { frontmatter, body } = parseFrontmatter(raw);
    const wikiDir = getWikiDir(spaceId);
    const bundlePath = path.relative(wikiDir, filePath).replace(/\\/g, "/");
    const conceptId = conceptIdFromPath(bundlePath);
    const slug = conceptId.split("/").at(-1) ?? conceptId;
    const timestamp = extractString(frontmatter, "timestamp") ?? "";

    return {
      id: conceptId,
      space_id: spaceId,
      path: bundlePath,
      concept_id: conceptId,
      slug,
      type: extractString(frontmatter, "type") ?? "Reference",
      title: extractString(frontmatter, "title") ?? slug,
      description: extractString(frontmatter, "description") ?? "",
      resource: extractString(frontmatter, "resource") ?? null,
      content: body.trim(),
      frontmatter,
      tags: extractStringArray(frontmatter, "tags"),
      timestamp,
    };
  } catch {
    return null;
  }
}

export function readPageListItem(
  filePath: string,
  spaceId: string,
): Record<string, unknown> | null {
  const page = readPage(filePath, spaceId);
  if (!page) return null;
  return {
    id: page.id,
    space_id: page.space_id,
    path: page.path,
    concept_id: page.concept_id,
    slug: page.slug,
    type: page.type,
    title: page.title,
    description: page.description,
    resource: page.resource,
    tags: page.tags,
    timestamp: page.timestamp,
  };
}

export function readPageRaw(filePath: string): string | null {
  return readFileSafe(filePath);
}

export function getPageConceptId(filePath: string, spaceId: string): string {
  return conceptIdFromPath(path.relative(getWikiDir(spaceId), filePath).replace(/\\/g, "/"));
}
