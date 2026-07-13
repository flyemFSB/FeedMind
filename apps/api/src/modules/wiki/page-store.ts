import path from "node:path";
import { buildPageContent, normalizeWikilinkTarget, parseFrontmatter } from "@feedmind/wiki-core";
import type {
  WikiPageCreate,
  WikiPageListItem,
  WikiPageRead,
  WikiPageUpdate,
  WikiResolveResult,
} from "@feedmind/contracts";
import { HttpError } from "../../lib/http.js";
import {
  dateSortDesc,
  ensureDir,
  nowISO,
  safeRename,
  safeUnlink,
  safeWriteFile,
  getSpaceDir,
  invalidatePageCache,
  findPageBySlug,
  walkPages,
  readPage,
  readPageListItem,
  readPageRaw,
  normalizePageRelPath,
} from "./space-fs/index.js";

function slugFromPath(p: string): string {
  return path.basename(p, ".md");
}

export async function listWikiPages(
  spaceId: string,
  opts?: { type?: string; q?: string; limit?: number; offset?: number },
): Promise<{ items: WikiPageListItem[]; total: number }> {
  const files = walkPages(spaceId, opts?.type);
  const items: WikiPageListItem[] = [];

  for (const filePath of files) {
    const data = readPageListItem(filePath, spaceId);
    if (!data) continue;
    const item = data as unknown as WikiPageListItem;
    if (opts?.q) {
      const q = opts.q.toLowerCase();
      if (
        !item.title.toLowerCase().includes(q) &&
        !item.path.toLowerCase().includes(q) &&
        !item.slug.toLowerCase().includes(q)
      )
        continue;
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
  const filePath = findPageBySlug(spaceId, pageId);
  if (!filePath) throw new HttpError(404, "HTTP_ERROR", `Wiki page does not exist (${pageId})`);

  const data = readPage(filePath, spaceId);
  if (!data) throw new HttpError(404, "HTTP_ERROR", `Wiki page does not exist (${pageId})`);

  return data as unknown as WikiPageRead;
}

export async function createWikiPage(
  spaceId: string,
  payload: WikiPageCreate,
): Promise<WikiPageRead> {
  const normalizedPath = normalizePageRelPath(payload.path);
  const slug = slugFromPath(normalizedPath);
  const absPath = path.join(getSpaceDir(spaceId), normalizedPath);

  if (readPageRaw(absPath) !== null) {
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
  invalidatePageCache(spaceId);

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

export async function updateWikiPage(
  spaceId: string,
  pageId: string,
  payload: WikiPageUpdate,
): Promise<WikiPageRead> {
  const filePath = findPageBySlug(spaceId, pageId);
  if (!filePath) throw new HttpError(404, "HTTP_ERROR", `Wiki page does not exist (${pageId})`);

  const existing = readPage(filePath, spaceId) as unknown as WikiPageRead | null;
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
    const newPath = normalizePageRelPath(payload.path);
    const newAbsPath = path.join(getSpaceDir(spaceId), newPath);
    if (readPageRaw(newAbsPath) !== null) {
      throw new HttpError(409, "HTTP_ERROR", `Target path already exists (${newPath})`);
    }
    ensureDir(path.dirname(newAbsPath));
    safeRename(filePath, newAbsPath);
    safeWriteFile(newAbsPath, buildPageContent(updatedData));
    invalidatePageCache(spaceId);

    const newSlug = slugFromPath(newPath);
    return {
      id: newSlug,
      space_id: spaceId,
      path: newPath,
      slug: newSlug,
      type: updatedData.type as WikiPageRead["type"],
      title: updatedData.title,
      content: updatedData.content,
      frontmatter: { ...updatedData } as Record<string, unknown>,
      sources: updatedData.sources,
      tags: updatedData.tags,
      related: updatedData.related,
      created_at: existing.created_at,
      updated_at: now,
    };
  }

  safeWriteFile(filePath, buildPageContent(updatedData));
  invalidatePageCache(spaceId);

  return {
    id: existing.id,
    space_id: spaceId,
    path: existing.path,
    slug: existing.slug,
    type: updatedData.type as WikiPageRead["type"],
    title: updatedData.title,
    content: updatedData.content,
    frontmatter: { ...updatedData } as Record<string, unknown>,
    sources: updatedData.sources,
    tags: updatedData.tags,
    related: updatedData.related,
    created_at: existing.created_at,
    updated_at: now,
  };
}

export async function deleteWikiPage(spaceId: string, pageId: string): Promise<void> {
  const filePath = findPageBySlug(spaceId, pageId);
  if (!filePath) throw new HttpError(404, "HTTP_ERROR", `Wiki page does not exist (${pageId})`);

  safeUnlink(filePath);
  invalidatePageCache(spaceId);
}

export async function resolveWikiLink(spaceId: string, target: string): Promise<WikiResolveResult> {
  const files = walkPages(spaceId);
  const bySlug = new Map<string, WikiPageRead>();
  const slugList: Array<{ slug: string; path: string; title: string }> = [];

  for (const filePath of files) {
    const slug = path.basename(filePath, ".md");
    const page = readPage(filePath, spaceId) as unknown as WikiPageRead | null;
    if (!page) continue;
    bySlug.set(slug, page);
    slugList.push({ slug, path: page.path, title: page.title });
  }

  if (bySlug.has(target)) {
    const page = bySlug.get(target)!;
    return {
      resolved: true,
      page_id: page.id,
      slug: page.slug,
      title: page.title,
      status: "resolved" as const,
      candidates: [],
    };
  }

  const normalized = normalizeWikilinkTarget(target.replace(/\\/g, "/").replace(/\.md$/i, ""));
  const pathTarget = normalized.replace(/^wiki\//, "");
  const matches = slugList.filter(
    (s) =>
      normalizeWikilinkTarget(s.slug) === normalized ||
      normalizeWikilinkTarget(s.title) === normalized ||
      normalizeWikilinkTarget(s.path.replace(/\.md$/i, "")) === normalized ||
      normalizeWikilinkTarget(s.path.replace(/^wiki\//, "").replace(/\.md$/i, "")) === pathTarget,
  );

  if (matches.length === 1) {
    return {
      resolved: true,
      page_id: matches[0].slug,
      slug: matches[0].slug,
      title: matches[0].title,
      status: "resolved" as const,
      candidates: [],
    };
  }
  if (matches.length > 1) {
    return {
      resolved: false,
      page_id: null,
      slug: null,
      title: null,
      status: "ambiguous" as const,
      candidates: matches.map((m) => ({
        page_id: m.slug,
        path: m.path,
        title: m.title,
        slug: m.slug,
      })),
    };
  }

  return {
    resolved: false,
    page_id: null,
    slug: null,
    title: null,
    status: "missing" as const,
    candidates: [],
  };
}

export async function getWikiBacklinks(
  spaceId: string,
  pageId: string,
): Promise<Array<{ page_id: string; slug: string; title: string; path: string }>> {
  const files = walkPages(spaceId);
  const backlinks: Array<{ page_id: string; slug: string; title: string; path: string }> = [];
  const linkPattern = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  const targetSlug = pageId.toLowerCase();

  for (const filePath of files) {
    try {
      const content = readPageRaw(filePath);
      if (!content) continue;
      const slug = path.basename(filePath, ".md");
      if (slug === pageId) continue;

      const clean = content.replace(/```[\s\S]*?```/g, "");
      linkPattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      let found = false;
      while ((match = linkPattern.exec(clean)) !== null) {
        const rawTarget = match[1]!.trim();
        const normalized = rawTarget.toLowerCase().replace(/\s+/g, "-");
        if (normalized === targetSlug || normalized === pageId.toLowerCase()) {
          found = true;
          break;
        }
      }
      if (!found) continue;

      const { frontmatter } = parseFrontmatter(content);
      const title = (frontmatter.title as string) ?? slug;
      const relPath = path.relative(getSpaceDir(spaceId), filePath).replace(/\\/g, "/");
      backlinks.push({ page_id: slug, slug, title, path: relPath });
    } catch {
      /* skip unreadable */
    }
  }

  return backlinks;
}
