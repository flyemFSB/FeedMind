import { randomUUID } from "node:crypto";
import { and, count, desc, eq, like, ne, or } from "drizzle-orm";
import type {
  WikiPageCreate,
  WikiPageListItem,
  WikiPageRead,
  WikiPageUpdate,
  WikiResolveResult,
  WikiSourceCreate,
  WikiSourceListItem,
  WikiSourceRead,
  WikiSpaceCreate,
  WikiSpaceListItem,
  WikiSpaceRead,
  WikiSpaceSettings,
  WikiSpaceUpdate,
} from "@feedmind/contracts";
import {
  db,
  wikiLinks,
  wikiPageRevisions,
  wikiPages,
  wikiSourcePages,
  wikiSources,
  wikiSpaces,
  type WikiPageRow,
  type WikiSourceRow,
  type WikiSpaceRow,
} from "@feedmind/db";
import { toIsoString } from "@feedmind/shared";
import { HttpError } from "../../lib/http.js";

// ─── Helpers ───────────────────────────────────────────────────
function slugFromPath(path: string): string {
  const basename = path.split("/").pop() ?? path;
  return basename.replace(/\.md$/i, "");
}

function iso(val: string | null | undefined): string | null {
  return toIsoString(val);
}

function parseJsonSafe<T>(val: string | null | undefined, fallback: T): T {
  if (!val) return fallback;
  try {
    return JSON.parse(val) as T;
  } catch {
    return fallback;
  }
}

function buildFrontmatter(page: WikiPageRow): Record<string, unknown> {
  return {
    type: page.type,
    title: page.title,
    sources: parseJsonSafe<string[]>(page.sources, []),
    tags: parseJsonSafe<string[]>(page.tags, []),
    related: parseJsonSafe<string[]>(page.related, []),
  };
}

function simpleHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

function parseCount(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === "object" && "value" in (val as Record<string, unknown>)) {
    return Number((val as Record<string, unknown>).value ?? 0);
  }
  return Number(val);
}

// ─── Space ─────────────────────────────────────────────────────
function toSpaceRead(row: WikiSpaceRow): WikiSpaceRead {
  return {
    id: row.id,
    name: row.name,
    template: row.template as WikiSpaceRead["template"],
    purpose: row.purpose,
    schema: row.schema,
    settings: parseJsonSafe<WikiSpaceSettings>(row.settings, {
      language: "zh-CN",
      enabledPageTypes: [
        "entity",
        "concept",
        "source",
        "query",
        "comparison",
        "synthesis",
        "overview",
      ],
      extraDirs: [],
    }),
    page_count: 0,
    source_count: 0,
    created_at: iso(row.createdAt) ?? "",
    updated_at: iso(row.updatedAt) ?? "",
  };
}

export async function listWikiSpaces(): Promise<WikiSpaceListItem[]> {
  const rows = await db
    .select({
      id: wikiSpaces.id,
      name: wikiSpaces.name,
      template: wikiSpaces.template,
      createdAt: wikiSpaces.createdAt,
      updatedAt: wikiSpaces.updatedAt,
      pageCount: count(wikiPages.id),
      sourceCount: count(wikiSources.id),
    })
    .from(wikiSpaces)
    .leftJoin(wikiPages, eq(wikiPages.spaceId, wikiSpaces.id))
    .leftJoin(wikiSources, eq(wikiSources.spaceId, wikiSpaces.id))
    .groupBy(wikiSpaces.id)
    .orderBy(desc(wikiSpaces.updatedAt));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    template: r.template as WikiSpaceListItem["template"],
    page_count: parseCount(r.pageCount),
    source_count: parseCount(r.sourceCount),
    created_at: iso(r.createdAt) ?? "",
    updated_at: iso(r.updatedAt) ?? "",
  }));
}

export async function getWikiSpace(spaceId: string): Promise<WikiSpaceRead> {
  const [space] = await db
    .select()
    .from(wikiSpaces)
    .where(eq(wikiSpaces.id, spaceId))
    .limit(1);
  if (!space) throw new HttpError(404, "HTTP_ERROR", "Wiki 空间不存在");
  const read = toSpaceRead(space);

  const [pc] = await db
    .select({ value: count() })
    .from(wikiPages)
    .where(eq(wikiPages.spaceId, spaceId));
  const [sc] = await db
    .select({ value: count() })
    .from(wikiSources)
    .where(eq(wikiSources.spaceId, spaceId));
  return { ...read, page_count: pc?.value ?? 0, source_count: sc?.value ?? 0 };
}

export async function createWikiSpace(
  payload: WikiSpaceCreate,
): Promise<WikiSpaceRead> {
  const id = randomUUID();
  const defaults = {
    language: "zh-CN" as const,
    enabledPageTypes: [
      "entity",
      "concept",
      "source",
      "query",
      "comparison",
      "synthesis",
      "overview",
    ] as string[],
    extraDirs: [] as string[],
  };
  const settings: WikiSpaceSettings = { ...defaults, ...payload.settings };
  const [row] = await db
    .insert(wikiSpaces)
    .values({
      id,
      name: payload.name,
      template: payload.template,
      purpose: payload.purpose,
      schema: payload.schema,
      settings: JSON.stringify(settings),
    })
    .returning();
  return toSpaceRead(row);
}

export async function updateWikiSpace(
  spaceId: string,
  payload: WikiSpaceUpdate,
): Promise<WikiSpaceRead> {
  const [existing] = await db
    .select()
    .from(wikiSpaces)
    .where(eq(wikiSpaces.id, spaceId))
    .limit(1);
  if (!existing) throw new HttpError(404, "HTTP_ERROR", "Wiki 空间不存在");

  const updates: Record<string, string> = {};
  if (payload.name !== undefined) updates.name = payload.name;
  if (payload.purpose !== undefined) updates.purpose = payload.purpose;
  if (payload.schema !== undefined) updates.schema = payload.schema;
  if (payload.settings !== undefined) {
    const current = parseJsonSafe<WikiSpaceSettings>(
      existing.settings,
      {} as WikiSpaceSettings,
    );
    updates.settings = JSON.stringify({ ...current, ...payload.settings });
  }

  const [row] = await db
    .update(wikiSpaces)
    .set({ ...updates, updatedAt: new Date().toISOString() })
    .where(eq(wikiSpaces.id, spaceId))
    .returning();
  return toSpaceRead(row);
}

// ─── Page ──────────────────────────────────────────────────────
function toPageRead(row: WikiPageRow): WikiPageRead {
  return {
    id: row.id,
    space_id: row.spaceId,
    path: row.path,
    slug: row.slug,
    type: row.type as WikiPageRead["type"],
    title: row.title,
    content: row.content,
    frontmatter: parseJsonSafe(row.frontmatter, {}),
    sources: parseJsonSafe<string[]>(row.sources, []),
    tags: parseJsonSafe<string[]>(row.tags, []),
    related: parseJsonSafe<string[]>(row.related, []),
    created_at: iso(row.createdAt) ?? "",
    updated_at: iso(row.updatedAt) ?? "",
  };
}

function toPageListItem(row: WikiPageRow): WikiPageListItem {
  return {
    id: row.id,
    space_id: row.spaceId,
    path: row.path,
    slug: row.slug,
    type: row.type as WikiPageListItem["type"],
    title: row.title,
    tags: parseJsonSafe<string[]>(row.tags, []),
    created_at: iso(row.createdAt) ?? "",
    updated_at: iso(row.updatedAt) ?? "",
  };
}

export async function listWikiPages(
  spaceId: string,
  opts?: { type?: string; q?: string; limit?: number; offset?: number },
): Promise<{ items: WikiPageListItem[]; total: number }> {
  const conditions = [eq(wikiPages.spaceId, spaceId)];
  if (opts?.type) conditions.push(eq(wikiPages.type, opts.type));
  if (opts?.q) {
    const kw = `%${opts.q}%`;
    conditions.push(
      or(
        like(wikiPages.title, kw),
        like(wikiPages.path, kw),
        like(wikiPages.slug, kw),
      )!,
    );
  }

  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;

  const [totalRow] = await db
    .select({ value: count() })
    .from(wikiPages)
    .where(and(...conditions));
  const total = totalRow?.value ?? 0;

  const rows = await db
    .select()
    .from(wikiPages)
    .where(and(...conditions))
    .orderBy(desc(wikiPages.updatedAt))
    .limit(limit)
    .offset(offset);
  return { items: rows.map(toPageListItem), total };
}

export async function getWikiPage(
  spaceId: string,
  pageId: string,
): Promise<WikiPageRead> {
  const [row] = await db
    .select()
    .from(wikiPages)
    .where(and(eq(wikiPages.id, pageId), eq(wikiPages.spaceId, spaceId)))
    .limit(1);
  if (!row) throw new HttpError(404, "HTTP_ERROR", "Wiki 页面不存在");
  return toPageRead(row);
}

export async function createWikiPage(
  spaceId: string,
  payload: WikiPageCreate,
): Promise<WikiPageRead> {
  const [existing] = await db
    .select()
    .from(wikiPages)
    .where(
      and(eq(wikiPages.spaceId, spaceId), eq(wikiPages.path, payload.path)),
    )
    .limit(1);
  if (existing) throw new HttpError(409, "HTTP_ERROR", "路径已存在");

  const slug = slugFromPath(payload.path);
  const [row] = await db
    .insert(wikiPages)
    .values({
      spaceId,
      path: payload.path,
      slug,
      type: payload.type,
      title: payload.title,
      content: payload.content,
      sources: JSON.stringify(payload.sources),
      tags: JSON.stringify(payload.tags),
      related: JSON.stringify(payload.related),
      frontmatter: JSON.stringify({
        type: payload.type,
        title: payload.title,
        sources: payload.sources,
        tags: payload.tags,
        related: payload.related,
      }),
    })
    .returning();
  return toPageRead(row);
}

export async function updateWikiPage(
  spaceId: string,
  pageId: string,
  payload: WikiPageUpdate,
): Promise<WikiPageRead> {
  const [existing] = await db
    .select()
    .from(wikiPages)
    .where(and(eq(wikiPages.id, pageId), eq(wikiPages.spaceId, spaceId)))
    .limit(1);
  if (!existing) throw new HttpError(404, "HTTP_ERROR", "Wiki 页面不存在");

  const updates: Record<string, unknown> = {};
  if (payload.path !== undefined) {
    updates.path = payload.path;
    updates.slug = slugFromPath(payload.path);
  }
  if (payload.title !== undefined) updates.title = payload.title;
  if (payload.content !== undefined) updates.content = payload.content;
  if (payload.sources !== undefined) updates.sources = JSON.stringify(payload.sources);
  if (payload.tags !== undefined) updates.tags = JSON.stringify(payload.tags);
  if (payload.related !== undefined) updates.related = JSON.stringify(payload.related);
  updates.updatedAt = new Date().toISOString();

  // Write revision if content changed
  if (payload.content !== undefined && payload.content !== existing.content) {
    await db.insert(wikiPageRevisions).values({
      pageId,
      beforeContent: existing.content,
      afterContent: payload.content,
      reason: "manual_edit",
    });
  }

  await db.update(wikiPages).set(updates).where(eq(wikiPages.id, pageId));

  // Re-read to get updated row
  const [updated] = await db
    .select()
    .from(wikiPages)
    .where(eq(wikiPages.id, pageId))
    .limit(1);

  // Refresh links
  if (updated) {
    await refreshPageLinks(spaceId, updated);

    // Refresh frontmatter cache
    const fm = buildFrontmatter(updated);
    await db
      .update(wikiPages)
      .set({ frontmatter: JSON.stringify(fm) })
      .where(eq(wikiPages.id, pageId));

    return toPageRead(updated);
  }

  throw new HttpError(500, "INTERNAL_SERVER_ERROR", "更新页面后读取失败");
}

export async function deleteWikiPage(
  spaceId: string,
  pageId: string,
): Promise<void> {
  const [existing] = await db
    .select()
    .from(wikiPages)
    .where(and(eq(wikiPages.id, pageId), eq(wikiPages.spaceId, spaceId)))
    .limit(1);
  if (!existing) throw new HttpError(404, "HTTP_ERROR", "Wiki 页面不存在");
  await db.delete(wikiPages).where(eq(wikiPages.id, pageId));
}

export async function resolveWikiLink(
  spaceId: string,
  target: string,
): Promise<WikiResolveResult> {
  // Try exact path match
  const exactPath = target.endsWith(".md") ? target : `wiki/${target}.md`;
  const [byPath] = await db
    .select()
    .from(wikiPages)
    .where(
      and(eq(wikiPages.spaceId, spaceId), eq(wikiPages.path, exactPath)),
    )
    .limit(1);
  if (byPath) {
    return {
      resolved: true,
      page_id: byPath.id,
      slug: byPath.slug,
      title: byPath.title,
      status: "resolved",
      candidates: [],
    };
  }

  // Try by slug
  const slug = target.replace(/\.md$/i, "");
  const bySlug = await db
    .select()
    .from(wikiPages)
    .where(and(eq(wikiPages.spaceId, spaceId), eq(wikiPages.slug, slug)));

  if (bySlug.length === 1) {
    return {
      resolved: true,
      page_id: bySlug[0].id,
      slug: bySlug[0].slug,
      title: bySlug[0].title,
      status: "resolved",
      candidates: [],
    };
  }

  if (bySlug.length > 1) {
    return {
      resolved: false,
      page_id: null,
      slug: null,
      title: null,
      status: "ambiguous",
      candidates: bySlug.map((p) => ({
        page_id: p.id,
        path: p.path,
        title: p.title,
        slug: p.slug,
      })),
    };
  }

  return {
    resolved: false,
    page_id: null,
    slug: null,
    title: null,
    status: "missing",
    candidates: [],
  };
}

// ─── Source ────────────────────────────────────────────────────
function toSourceRead(row: WikiSourceRow): WikiSourceRead {
  return {
    id: row.id,
    space_id: row.spaceId,
    identity: row.identity,
    title: row.title,
    kind: row.kind as WikiSourceRead["kind"],
    original_name: row.originalName,
    original_uri: row.originalUri,
    storage_path: row.storagePath,
    mime_type: row.mimeType,
    size_bytes: row.sizeBytes,
    content_hash: row.contentHash,
    status: row.status as WikiSourceRead["status"],
    metadata: parseJsonSafe(row.metadata, {}),
    page_count: 0,
    created_at: iso(row.createdAt) ?? "",
    updated_at: iso(row.updatedAt) ?? "",
  };
}

function toSourceListItem(row: WikiSourceRow): WikiSourceListItem {
  return {
    id: row.id,
    space_id: row.spaceId,
    identity: row.identity,
    title: row.title,
    kind: row.kind as WikiSourceListItem["kind"],
    original_name: row.originalName,
    mime_type: row.mimeType,
    status: row.status as WikiSourceListItem["status"],
    page_count: 0,
    created_at: iso(row.createdAt) ?? "",
    updated_at: iso(row.updatedAt) ?? "",
  };
}

export async function listWikiSources(
  spaceId: string,
  opts?: { status?: string; limit?: number; offset?: number },
): Promise<{ items: WikiSourceListItem[]; total: number }> {
  const conditions = [eq(wikiSources.spaceId, spaceId)];
  if (opts?.status) conditions.push(eq(wikiSources.status, opts.status));

  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;

  const [totalRow] = await db
    .select({ value: count() })
    .from(wikiSources)
    .where(and(...conditions));
  const total = totalRow?.value ?? 0;

  const rows = await db
    .select()
    .from(wikiSources)
    .where(and(...conditions))
    .orderBy(desc(wikiSources.updatedAt))
    .limit(limit)
    .offset(offset);
  return { items: rows.map(toSourceListItem), total };
}

export async function getWikiSource(
  spaceId: string,
  sourceId: string,
): Promise<WikiSourceRead> {
  const [row] = await db
    .select()
    .from(wikiSources)
    .where(
      and(eq(wikiSources.id, sourceId), eq(wikiSources.spaceId, spaceId)),
    )
    .limit(1);
  if (!row) throw new HttpError(404, "HTTP_ERROR", "Wiki 来源不存在");
  const read = toSourceRead(row);

  const [pc] = await db
    .select({ value: count() })
    .from(wikiSourcePages)
    .where(eq(wikiSourcePages.sourceId, sourceId));
  return { ...read, page_count: pc?.value ?? 0 };
}

export async function createWikiSource(
  spaceId: string,
  payload: WikiSourceCreate,
): Promise<WikiSourceRead> {
  const sourceId = randomUUID();
  const identity =
    payload.original_name ??
    payload.title.toLowerCase().replace(/\s+/g, "-") + ".md";

  const [row] = await db
    .insert(wikiSources)
    .values({
      id: sourceId,
      spaceId,
      identity,
      title: payload.title,
      kind: payload.kind,
      originalName: payload.original_name ?? null,
      originalUri: payload.original_uri ?? null,
      normalizedText: payload.content,
      mimeType:
        payload.kind === "url"
          ? "text/html"
          : payload.kind === "text"
            ? "text/plain"
            : null,
      sizeBytes: payload.content.length,
      contentHash: simpleHash(payload.content),
      metadata: JSON.stringify(payload.metadata),
    })
    .returning();
  return toSourceRead(row);
}

export async function deleteWikiSource(
  spaceId: string,
  sourceId: string,
  mode: "detach" | "delete-orphans" = "detach",
): Promise<{ deleted_pages: number; updated_pages: number }> {
  const [source] = await db
    .select()
    .from(wikiSources)
    .where(
      and(eq(wikiSources.id, sourceId), eq(wikiSources.spaceId, spaceId)),
    )
    .limit(1);
  if (!source) throw new HttpError(404, "HTTP_ERROR", "Wiki 来源不存在");

  const relations = await db
    .select()
    .from(wikiSourcePages)
    .where(eq(wikiSourcePages.sourceId, sourceId));

  let deletedPages = 0;
  let updatedPages = 0;

  if (mode === "delete-orphans" && relations.length > 0) {
    for (const rel of relations) {
      const [otherCount] = await db
        .select({ value: count() })
        .from(wikiSourcePages)
        .where(
          and(
            eq(wikiSourcePages.pageId, rel.pageId),
            ne(wikiSourcePages.sourceId, sourceId),
          ),
        );

      if (otherCount?.value === 0) {
        await db.delete(wikiPages).where(eq(wikiPages.id, rel.pageId));
        deletedPages++;
      } else {
        const [page] = await db
          .select()
          .from(wikiPages)
          .where(eq(wikiPages.id, rel.pageId))
          .limit(1);
        if (page) {
          const sources = parseJsonSafe<string[]>(page.sources, []);
          const updated = sources.filter((s) => s !== source.identity);
          await db
            .update(wikiPages)
            .set({ sources: JSON.stringify(updated) })
            .where(eq(wikiPages.id, rel.pageId));
          updatedPages++;
        }
      }
    }
  }

  await db.delete(wikiSources).where(eq(wikiSources.id, sourceId));
  return { deleted_pages: deletedPages, updated_pages: updatedPages };
}

// ─── Jobs ──────────────────────────────────────────────────────
export async function listWikiJobs(
  spaceId: string,
  _opts?: { status?: string; limit?: number; offset?: number },
) {
  return { items: [], total: 0 };
}

// ─── Wikilink Refresh ──────────────────────────────────────────
export async function refreshPageLinks(
  spaceId: string,
  page: WikiPageRow,
): Promise<void> {
  // Delete existing links from this page
  await db
    .delete(wikiLinks)
    .where(
      and(eq(wikiLinks.spaceId, spaceId), eq(wikiLinks.fromPageId, page.id)),
    );

  // Extract [[wikilink]] patterns from content
  // Simply skip fenced code blocks by stripping them first
  const content = page.content.replace(/```[\s\S]*?```/g, "");
  const linkPattern = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

  const links: Array<{
    spaceId: string;
    fromPageId: string;
    rawTarget: string;
    alias: string | null;
    status: string;
    toPageId: string | null;
  }> = [];

  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(content)) !== null) {
    const rawTarget = match[1]!.trim();
    const alias = match[2]?.trim() ?? null;
    links.push({
      spaceId,
      fromPageId: page.id,
      rawTarget,
      alias,
      status: "missing",
      toPageId: null,
    });
  }

  if (links.length === 0) return;

  // Resolve each link
  for (const link of links) {
    const result = await resolveWikiLink(spaceId, link.rawTarget);
    link.status = result.status;
    link.toPageId = result.page_id;
  }

  await db.insert(wikiLinks).values(links);
}
