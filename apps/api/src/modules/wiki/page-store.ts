import fs from "node:fs";
import path from "node:path";
import { parseFrontmatter, formatFrontmatter, buildPageContent } from "@feedmind/wiki-core";
import type { WikiPageCreate, WikiPageListItem, WikiPageRead, WikiPageUpdate, WikiResolveResult } from "@feedmind/contracts";
import { HttpError } from "../../lib/http.js";
import { dateSortDesc, ensureDir, nowISO, readDirRecursive, safeRename, safeUnlink, safeWriteFile, slugify, spaceDir } from "./wiki-utils.js";

const TYPE_DIR_MAP: Record<string, string> = {
  entity: "entities",
  concept: "concepts",
  source: "sources",
  overview: "",
  index: "",
};
const DIR_TYPE_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(TYPE_DIR_MAP).map(([t, d]) => [d, t]),
);

// ─── Page file slug cache ─────────────────────────────────────

const pageFileCache = new Map<string, Map<string, string>>();

function getSlugCache(spaceId: string): Map<string, string> {
  let cache = pageFileCache.get(spaceId);
  if (cache) return cache;
  cache = new Map<string, string>();
  const dir = path.join(spaceDir(spaceId), "wiki");
  try {
    const files = readDirRecursive(dir, (_f, name) => name.endsWith(".md"));
    for (const f of files) {
      cache.set(path.basename(f, ".md"), f);
    }
  } catch { /* dir not created yet */ }
  pageFileCache.set(spaceId, cache);
  return cache;
}

function findPageFile(spaceId: string, slug: string): string | null {
  return getSlugCache(spaceId).get(slug) ?? null;
}

export function invalidatePageFileCache(spaceId: string): void {
  pageFileCache.delete(spaceId);
}

// ─── Path helpers ─────────────────────────────────────────────

function normalizePagePath(p: string): string {
  // 统一反斜杠为正斜杠（Windows 路径穿越防护）
  const normalized = p.replace(/\\/g, "/");
  const withExt = normalized.endsWith(".md") ? normalized : `${normalized}.md`;
  const prefixed = withExt.startsWith("wiki/") ? withExt : `wiki/${withExt}`;
  const parts = prefixed.split("/");
  // 拒绝 .. 和 . 以及绝对路径
  for (const part of parts) {
    if (part === ".." || part === "." || part.startsWith("/") || part.startsWith("\\")) {
      throw new HttpError(400, "HTTP_ERROR", "Path must not contain .. or . or be absolute");
    }
  }
  return prefixed;
}

function slugFromPath(p: string): string {
  return path.basename(p, ".md");
}

function inferTypeFromDir(relDir: string): string {
  const parts = relDir.replace(/\\/g, "/").split("/");
  const wikiIdx = parts.indexOf("wiki");
  if (wikiIdx >= 0 && wikiIdx + 1 < parts.length) {
    const sub = parts[wikiIdx + 1];
    return DIR_TYPE_MAP[sub] ?? (sub ? "concept" : "overview");
  }
  return wikiIdx >= 0 ? "overview" : "concept";
}

// ─── Page file → DTO mappers ──────────────────────────────────

function pageFileToRead(filePath: string, spaceId: string): WikiPageRead | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const { frontmatter, body } = parseFrontmatter(content);

    const relPath = path.relative(spaceDir(spaceId), filePath).replace(/\\/g, "/");
    const slug = path.basename(filePath, ".md");
    const pageType = (frontmatter.type as string) || inferTypeFromDir(relPath) || "concept";

    return {
      id: slug,
      space_id: spaceId,
      path: relPath,
      slug,
      type: pageType as WikiPageRead["type"],
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

function pageFileToListItem(filePath: string, spaceId: string): WikiPageListItem | null {
  const read = pageFileToRead(filePath, spaceId);
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

function walkAllPages(spaceId: string): string[] {
  const wikiDir = path.join(spaceDir(spaceId), "wiki");
  return readDirRecursive(wikiDir, (_f, name) => name.endsWith(".md"));
}

function walkScopedPages(spaceId: string, typeFilter?: string): string[] {
  const wikiDir = path.join(spaceDir(spaceId), "wiki");
  if (typeFilter && TYPE_DIR_MAP[typeFilter] !== undefined) {
    const sub = TYPE_DIR_MAP[typeFilter];
    const scanDir = sub ? path.join(wikiDir, sub) : wikiDir;
    try {
      return readDirRecursive(scanDir, (_f, name) => name.endsWith(".md"));
    } catch { return []; }
  }
  return walkAllPages(spaceId);
}

// ─── Public API ───────────────────────────────────────────────

export async function listWikiPages(
  spaceId: string,
  opts?: { type?: string; q?: string; limit?: number; offset?: number },
): Promise<{ items: WikiPageListItem[]; total: number }> {
  const files = walkScopedPages(spaceId, opts?.type);
  const items: WikiPageListItem[] = [];

  for (const filePath of files) {
    const item = pageFileToListItem(filePath, spaceId);
    if (!item) continue;
    if (opts?.q) {
      const q = opts.q.toLowerCase();
      if (!item.title.toLowerCase().includes(q) && !item.path.toLowerCase().includes(q) && !item.slug.toLowerCase().includes(q)) continue;
    }
    items.push(item);
  }

  items.sort((a, b) => dateSortDesc(a.updated_at, b.updated_at));

  const total = items.length;
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;
  return { items: items.slice(offset, offset + limit), total };
}

export async function getWikiPage(spaceId: string, pageId: string): Promise<WikiPageRead> {
  const filePath = findPageFile(spaceId, pageId);
  if (!filePath) throw new HttpError(404, "HTTP_ERROR", `Wiki page does not exist (${pageId})`);

  const page = pageFileToRead(filePath, spaceId);
  if (!page) throw new HttpError(404, "HTTP_ERROR", `Wiki page does not exist (${pageId})`);

  return page;
}

export async function createWikiPage(spaceId: string, payload: WikiPageCreate): Promise<WikiPageRead> {
  const normalizedPath = normalizePagePath(payload.path);
  const slug = slugFromPath(normalizedPath);
  const absPath = path.join(spaceDir(spaceId), normalizedPath);

  if (fs.existsSync(absPath)) {
    throw new HttpError(409, "HTTP_ERROR", `Path already exists (${normalizedPath})`);
  }

  ensureDir(path.dirname(absPath));

  const now = nowISO();
  const pageData = {
    type: payload.type ?? "concept",
    title: payload.title,
    tags: payload.tags ?? [],
    sources: payload.sources ?? [],
    related: payload.related ?? [],
    created: now,
    updated: now,
    content: payload.content || "",
  };

  safeWriteFile(absPath, buildPageContent(pageData));
  invalidatePageFileCache(spaceId);

  return {
    id: slug,
    space_id: spaceId,
    path: normalizedPath,
    slug,
    type: pageData.type as WikiPageRead["type"],
    title: pageData.title,
    content: pageData.content,
    frontmatter: { ...pageData } as Record<string, unknown>,
    sources: pageData.sources,
    tags: pageData.tags,
    related: pageData.related,
    created_at: now,
    updated_at: now,
  };
}

export async function updateWikiPage(spaceId: string, pageId: string, payload: WikiPageUpdate): Promise<WikiPageRead> {
  const filePath = findPageFile(spaceId, pageId);
  if (!filePath) throw new HttpError(404, "HTTP_ERROR", `Wiki page does not exist (${pageId})`);

  const existing = pageFileToRead(filePath, spaceId);
  if (!existing) throw new HttpError(404, "HTTP_ERROR", `Wiki page does not exist (${pageId})`);

  const now = nowISO();
  const updatedData = {
    type: existing.type,
    title: payload.title ?? existing.title,
    tags: payload.tags ?? existing.tags,
    sources: payload.sources ?? existing.sources,
    related: payload.related ?? existing.related,
    created: existing.created_at,
    updated: now,
    content: payload.content ?? existing.content,
  };

  if (payload.path && payload.path !== existing.path.replace(/^wiki\//, "")) {
    const newPath = normalizePagePath(payload.path);
    const newAbsPath = path.join(spaceDir(spaceId), newPath);
    if (fs.existsSync(newAbsPath)) {
      throw new HttpError(409, "HTTP_ERROR", `Target path already exists (${newPath})`);
    }
    ensureDir(path.dirname(newAbsPath));
    safeRename(filePath, newAbsPath);
    safeWriteFile(newAbsPath, buildPageContent(updatedData));
    invalidatePageFileCache(spaceId);

    const newSlug = slugFromPath(newPath);
    return {
      id: newSlug, space_id: spaceId, path: newPath, slug: newSlug,
      type: updatedData.type as WikiPageRead["type"], title: updatedData.title,
      content: updatedData.content, frontmatter: { ...updatedData } as Record<string, unknown>,
      sources: updatedData.sources, tags: updatedData.tags, related: updatedData.related,
      created_at: existing.created_at, updated_at: now,
    };
  }

  safeWriteFile(filePath, buildPageContent(updatedData));
  invalidatePageFileCache(spaceId);

  return {
    id: existing.id, space_id: spaceId, path: existing.path, slug: existing.slug,
    type: updatedData.type as WikiPageRead["type"], title: updatedData.title,
    content: updatedData.content, frontmatter: { ...updatedData } as Record<string, unknown>,
    sources: updatedData.sources, tags: updatedData.tags, related: updatedData.related,
    created_at: existing.created_at, updated_at: now,
  };
}

export async function deleteWikiPage(spaceId: string, pageId: string): Promise<void> {
  const filePath = findPageFile(spaceId, pageId);
  if (!filePath) throw new HttpError(404, "HTTP_ERROR", `Wiki page does not exist (${pageId})`);

  safeUnlink(filePath);
  invalidatePageFileCache(spaceId);
}

export async function resolveWikiLink(spaceId: string, target: string): Promise<WikiResolveResult> {
  const files = walkAllPages(spaceId);
  const bySlug = new Map<string, WikiPageRead>();
  const slugList: Array<{ slug: string; path: string; title: string }> = [];

  for (const filePath of files) {
    const slug = path.basename(filePath, ".md");
    const page = pageFileToRead(filePath, spaceId);
    if (!page) continue;
    bySlug.set(slug, page);
    slugList.push({ slug, path: page.path, title: page.title });
  }

  if (bySlug.has(target)) {
    const page = bySlug.get(target)!;
    return { resolved: true, page_id: page.id, slug: page.slug, title: page.title, status: "resolved" as const, candidates: [] };
  }

  const normalized = target.toLowerCase().replace(/\s+/g, "-");
  const matches = slugList.filter(
    (s) => s.slug.toLowerCase() === normalized || s.slug.toLowerCase() === target.toLowerCase(),
  );

  if (matches.length === 1) {
    return { resolved: true, page_id: matches[0].slug, slug: matches[0].slug, title: matches[0].title, status: "resolved" as const, candidates: [] };
  }
  if (matches.length > 1) {
    return {
      resolved: false, page_id: null, slug: null, title: null, status: "ambiguous" as const,
      candidates: matches.map((m) => ({ page_id: m.slug, path: m.path, title: m.title, slug: m.slug })),
    };
  }

  return { resolved: false, page_id: null, slug: null, title: null, status: "missing" as const, candidates: [] };
}

export async function getWikiBacklinks(spaceId: string, pageId: string): Promise<Array<{ page_id: string; slug: string; title: string; path: string }>> {
  const files = walkAllPages(spaceId);
  const backlinks: Array<{ page_id: string; slug: string; title: string; path: string }> = [];
  const linkPattern = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  const targetSlug = pageId.toLowerCase();

  for (const filePath of files) {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const slug = path.basename(filePath, ".md");
      if (slug === pageId) continue;

      const clean = content.replace(/```[\s\S]*?```/g, "");
      linkPattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      let found = false;
      while ((match = linkPattern.exec(clean)) !== null) {
        const rawTarget = match[1]!.trim();
        const normalized = rawTarget.toLowerCase().replace(/\s+/g, "-");
        if (normalized === targetSlug || normalized === pageId.toLowerCase()) { found = true; break; }
      }
      if (!found) continue;

      const { frontmatter } = parseFrontmatter(content);
      const title = (frontmatter.title as string) ?? slug;
      const relPath = path.relative(spaceDir(spaceId), filePath).replace(/\\/g, "/");
      backlinks.push({ page_id: slug, slug, title, path: relPath });
    } catch { /* skip unreadable */ }
  }

  return backlinks;
}
