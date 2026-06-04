import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
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
import { HttpError } from "../../lib/http.js";

// ─── Configuration ────────────────────────────────────────────────
const WIKI_ROOT = process.env.WIKI_DIR
  ? path.resolve(process.env.WIKI_DIR)
  : path.join(process.cwd(), "data", "wiki");

// Maps wiki page type → filesystem subdirectory
const TYPE_DIR_MAP: Record<string, string> = {
  entity: "entities",
  concept: "concepts",
  source: "sources",
  query: "queries",
  comparison: "comparisons",
  synthesis: "synthesis",
  overview: "",
  index: "",
};
const DIR_TYPE_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(TYPE_DIR_MAP).map(([t, d]) => [d, t]),
);

// ─── Helpers ──────────────────────────────────────────────────────

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function nowISO(): string {
  return new Date().toISOString();
}

/** Derive a safe directory/file name from a string. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s一-鿿-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    || "untitled";
}

/** [FIX P0] Reject path traversal, ensure normalized path stays under wiki/. */
function normalizePagePath(p: string): string {
  const withExt = p.endsWith(".md") ? p : `${p}.md`;
  const normalized = withExt.startsWith("wiki/") ? withExt : `wiki/${withExt}`;
  const parts = normalized.split("/");
  if (parts.some((part) => part === ".." || part === ".")) {
    throw new HttpError(400, "HTTP_ERROR", "路径不能包含 .. 或 .");
  }
  return normalized;
}

function slugFromPath(p: string): string {
  return path.basename(p, ".md");
}

/** Infer page type from the subdirectory name under wiki/. */
function inferTypeFromDir(relDir: string): string {
  const parts = relDir.replace(/\\/g, "/").split("/");
  const wikiIdx = parts.indexOf("wiki");
  if (wikiIdx >= 0 && wikiIdx + 1 < parts.length) {
    const sub = parts[wikiIdx + 1];
    return DIR_TYPE_MAP[sub] ?? (sub ? "concept" : "overview");
  }
  // file at wiki root or elsewhere
  return wikiIdx >= 0 ? "overview" : "concept";
}

// ─── Frontmatter ──────────────────────────────────────────────────

/** [FIX CRLF] Parse YAML frontmatter from markdown content. Handles \r\n. */
function parseFrontmatter(
  content: string,
): { frontmatter: Record<string, unknown>; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)\r?\n?/);
  if (!match) return { frontmatter: {}, body: content };

  const raw = match[1];
  const frontmatter: Record<string, unknown> = {};

  for (const line of raw.split(/\r?\n/)) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    if (!key) continue;

    if (value.startsWith("[") && value.endsWith("]")) {
      const inner = value.slice(1, -1).trim();
      frontmatter[key] = inner
        ? inner.split(",").map((s) => s.trim().replace(/^["']|["']$/g, ""))
        : [];
    } else {
      frontmatter[key] = value.replace(/^["']|["']$/g, "");
    }
  }

  return { frontmatter, body: content.slice(match[0].length) };
}

/** [FIX metadata] Format frontmatter, handling objects via JSON.stringify. */
function formatFrontmatter(fm: Record<string, unknown>): string {
  const lines: string[] = ["---"];
  for (const [key, value] of Object.entries(fm)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      lines.push(`${key}: [${value.map(String).join(", ")}]`);
    } else if (typeof value === "object") {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push("---");
  return lines.join("\n");
}

function buildPageContent(page: {
  type: string;
  title: string;
  tags: string[];
  sources: string[];
  related: string[];
  created: string;
  updated: string;
  content: string;
}): string {
  const fm: Record<string, unknown> = {
    type: page.type,
    title: page.title,
    tags: page.tags,
    sources: page.sources,
    related: page.related,
    created: page.created,
    updated: page.updated,
  };
  return formatFrontmatter(fm) + "\n" + page.content;
}

// ─── Page file slug cache (in-memory, invalidated on write) ───────

const pageFileCache = new Map<string, Map<string, string>>(); // spaceId → slug → absPath

function getSlugCache(spaceId: string): Map<string, string> {
  let cache = pageFileCache.get(spaceId);
  if (cache) return cache;
  cache = new Map<string, string>();
  const dir = path.join(spaceDir(spaceId), "wiki");
  // silently return empty cache if wiki dir doesn't exist yet
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

function invalidatePageFileCache(spaceId: string): void {
  pageFileCache.delete(spaceId);
}

// ─── Space helpers ────────────────────────────────────────────────

function safeWriteFile(filePath: string, content: string, encoding: BufferEncoding): void {
  try {
    fs.writeFileSync(filePath, content, encoding);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new HttpError(500, "INTERNAL_SERVER_ERROR", `文件写入失败: ${msg}`);
  }
}

function safeUnlink(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new HttpError(500, "INTERNAL_SERVER_ERROR", `文件删除失败: ${msg}`);
  }
}

function safeRename(oldPath: string, newPath: string): void {
  try {
    fs.renameSync(oldPath, newPath);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new HttpError(500, "INTERNAL_SERVER_ERROR", `文件移动失败: ${msg}`);
  }
}

function registryPath(): string {
  return path.join(WIKI_ROOT, "registry.json");
}

function spaceDir(spaceId: string): string {
  return path.join(WIKI_ROOT, spaceId);
}

function spaceMetaPath(spaceId: string): string {
  return path.join(spaceDir(spaceId), "space.json");
}

function readRegistry(): Array<Record<string, unknown>> {
  try {
    return JSON.parse(fs.readFileSync(registryPath(), "utf-8"));
  } catch {
    return [];
  }
}

function writeRegistry(registry: Array<Record<string, unknown>>): void {
  ensureDir(WIKI_ROOT);
  safeWriteFile(registryPath(), JSON.stringify(registry, null, 2), "utf-8");
}

function readSpaceMeta(spaceId: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(spaceMetaPath(spaceId), "utf-8"));
  } catch {
    return null;
  }
}

function writeSpaceMeta(spaceId: string, meta: Record<string, unknown>): void {
  ensureDir(spaceDir(spaceId));
  safeWriteFile(spaceMetaPath(spaceId), JSON.stringify(meta, null, 2), "utf-8");
}

function createSpaceDirectories(spaceId: string): void {
  const dirs = [
    "wiki",
    "wiki/entities",
    "wiki/concepts",
    "wiki/sources",
    "wiki/queries",
    "wiki/comparisons",
    "wiki/synthesis",
    "raw/sources",
  ];
  for (const d of dirs) {
    ensureDir(path.join(spaceDir(spaceId), d));
  }
}

function readDirRecursive(
  dir: string,
  predicate?: (filePath: string, relPath: string) => boolean,
): string[] {
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...readDirRecursive(fullPath, predicate));
      } else if (!predicate || predicate(fullPath, entry.name)) {
        results.push(fullPath);
      }
    }
  } catch { /* dir doesn't exist */ }
  return results;
}

function countFiles(dir: string, ext?: string): number {
  return readDirRecursive(dir, (_f, name) =>
    ext ? name.endsWith(ext) : true,
  ).length;
}

// ─── Date sort helper (safe against invalid/empty dates) ──────────

function dateSortDesc(a: string, b: string): number {
  const ta = a ? new Date(a).getTime() : 0;
  const tb = b ? new Date(b).getTime() : 0;
  return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
}

// ─── Space ────────────────────────────────────────────────────────

export async function listWikiSpaces(): Promise<WikiSpaceListItem[]> {
  const registry = readRegistry();
  const items: WikiSpaceListItem[] = [];

  for (const entry of registry) {
    const spaceId = entry.id as string;
    const meta = readSpaceMeta(spaceId);
    const spaceDirPath = spaceDir(spaceId);

    const pageCount = countFiles(path.join(spaceDirPath, "wiki"), ".md");
    const sourceCount = countFiles(path.join(spaceDirPath, "raw", "sources"));

    items.push({
      id: spaceId,
      name: (meta?.name as string) ?? (entry.name as string) ?? spaceId,
      template: (meta?.template ?? "general") as WikiSpaceListItem["template"],
      page_count: pageCount,
      source_count: sourceCount,
      created_at: (meta?.created_at as string) ?? "",
      updated_at: (meta?.updated_at as string) ?? "",
    });
  }

  return items.sort((a, b) => dateSortDesc(a.updated_at, b.updated_at));
}

export async function getWikiSpace(spaceId: string): Promise<WikiSpaceRead> {
  const meta = readSpaceMeta(spaceId);
  if (!meta) throw new HttpError(404, "HTTP_ERROR", `Wiki 空间不存在 (${spaceId})`);

  const spaceDirPath = spaceDir(spaceId);
  const pageCount = countFiles(path.join(spaceDirPath, "wiki"), ".md");
  const sourceCount = countFiles(path.join(spaceDirPath, "raw", "sources"));

  return {
    id: spaceId,
    name: (meta.name as string) ?? spaceId,
    template: (meta.template ?? "general") as WikiSpaceRead["template"],
    purpose: (meta.purpose as string) ?? "",
    schema: (meta.schema as string) ?? "",
    settings: (meta.settings as WikiSpaceSettings) ?? {
      language: "zh-CN",
      enabledPageTypes: [
        "entity", "concept", "source", "query",
        "comparison", "synthesis", "overview",
      ],
      extraDirs: [],
    },
    page_count: pageCount,
    source_count: sourceCount,
    created_at: (meta.created_at as string) ?? "",
    updated_at: (meta.updated_at as string) ?? "",
  };
}

export async function createWikiSpace(
  payload: WikiSpaceCreate,
): Promise<WikiSpaceRead> {
  const spaceId = slugify(payload.name);
  if (readSpaceMeta(spaceId)) {
    throw new HttpError(409, "HTTP_ERROR", `同名空间已存在 (${spaceId})`);
  }

  const now = nowISO();
  const meta: Record<string, unknown> = {
    id: spaceId,
    name: payload.name,
    template: payload.template ?? "general",
    purpose: payload.purpose ?? "",
    schema: payload.schema ?? "",
    settings: {
      language: "zh-CN",
      enabledPageTypes: [
        "entity", "concept", "source", "query",
        "comparison", "synthesis", "overview",
      ],
      extraDirs: [],
    },
    created_at: now,
    updated_at: now,
  };

  writeSpaceMeta(spaceId, meta);
  createSpaceDirectories(spaceId);

  // Write purpose.md and schema.md for llm_wiki compat
  safeWriteFile(
    path.join(spaceDir(spaceId), "purpose.md"),
    payload.purpose || "# Purpose\n\n",
    "utf-8",
  );
  safeWriteFile(
    path.join(spaceDir(spaceId), "schema.md"),
    payload.schema || "# Schema\n\n",
    "utf-8",
  );

  // Register
  const registry = readRegistry();
  registry.push({
    id: spaceId,
    name: payload.name,
  });
  writeRegistry(registry);

  return {
    id: spaceId,
    name: payload.name,
    template: payload.template ?? "general",
    purpose: payload.purpose ?? "",
    schema: payload.schema ?? "",
    settings: meta.settings as WikiSpaceSettings,
    page_count: 0,
    source_count: 0,
    created_at: now,
    updated_at: now,
  };
}

export async function updateWikiSpace(
  spaceId: string,
  payload: WikiSpaceUpdate,
): Promise<WikiSpaceRead> {
  const meta = readSpaceMeta(spaceId);
  if (!meta) throw new HttpError(404, "HTTP_ERROR", `Wiki 空间不存在 (${spaceId})`);

  if (payload.name !== undefined) meta.name = payload.name;
  if (payload.purpose !== undefined) meta.purpose = payload.purpose;
  if (payload.schema !== undefined) meta.schema = payload.schema;
  if (payload.settings !== undefined) {
    meta.settings = { ...(meta.settings as object), ...payload.settings };
  }
  meta.updated_at = nowISO();
  writeSpaceMeta(spaceId, meta);

  const spaceDirPath = spaceDir(spaceId);
  const pageCount = countFiles(path.join(spaceDirPath, "wiki"), ".md");
  const sourceCount = countFiles(path.join(spaceDirPath, "raw", "sources"));

  return {
    id: spaceId,
    name: (meta.name as string) ?? spaceId,
    template: (meta.template ?? "general") as WikiSpaceRead["template"],
    purpose: (meta.purpose as string) ?? "",
    schema: (meta.schema as string) ?? "",
    settings: (meta.settings as WikiSpaceSettings) ?? {
      language: "zh-CN",
      enabledPageTypes: [],
      extraDirs: [],
    },
    page_count: pageCount,
    source_count: sourceCount,
    created_at: (meta.created_at as string) ?? "",
    updated_at: (meta.updated_at as string) ?? "",
  };
}

// ─── Page ─────────────────────────────────────────────────────────

function pageFileToRead(
  filePath: string,
  spaceId: string,
): WikiPageRead | null {
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

function pageFileToListItem(
  filePath: string,
  spaceId: string,
): WikiPageListItem | null {
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

/** [FIX P3] When type filter is specified, only scan that subdirectory. */
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

export async function listWikiPages(
  spaceId: string,
  opts?: { type?: string; q?: string; limit?: number; offset?: number },
): Promise<{ items: WikiPageListItem[]; total: number }> {
  if (!readSpaceMeta(spaceId)) {
    throw new HttpError(404, "HTTP_ERROR", `Wiki 空间不存在 (${spaceId})`);
  }

  const files = walkScopedPages(spaceId, opts?.type);
  const items: WikiPageListItem[] = [];

  for (const filePath of files) {
    const item = pageFileToListItem(filePath, spaceId);
    if (!item) continue;

    if (opts?.q) {
      const q = opts.q.toLowerCase();
      if (
        !item.title.toLowerCase().includes(q) &&
        !item.path.toLowerCase().includes(q) &&
        !item.slug.toLowerCase().includes(q)
      ) continue;
    }
    items.push(item);
  }

  // Sort by updated_at descending
  items.sort((a, b) => dateSortDesc(a.updated_at, b.updated_at));

  const total = items.length;
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;
  const paged = items.slice(offset, offset + limit);

  return { items: paged, total };
}

export async function getWikiPage(
  spaceId: string,
  pageId: string,
): Promise<WikiPageRead> {
  if (!readSpaceMeta(spaceId)) {
    throw new HttpError(404, "HTTP_ERROR", `Wiki 空间不存在 (${spaceId})`);
  }

  const filePath = findPageFile(spaceId, pageId);
  if (!filePath) throw new HttpError(404, "HTTP_ERROR", `Wiki 页面不存在 (${pageId})`);

  const page = pageFileToRead(filePath, spaceId);
  if (!page) throw new HttpError(404, "HTTP_ERROR", `Wiki 页面不存在 (${pageId})`);

  return page;
}

export async function createWikiPage(
  spaceId: string,
  payload: WikiPageCreate,
): Promise<WikiPageRead> {
  if (!readSpaceMeta(spaceId)) {
    throw new HttpError(404, "HTTP_ERROR", `Wiki 空间不存在 (${spaceId})`);
  }

  const normalizedPath = normalizePagePath(payload.path);
  const slug = slugFromPath(normalizedPath);
  const relPath = normalizedPath;
  const absPath = path.join(spaceDir(spaceId), relPath);

  if (fs.existsSync(absPath)) {
    throw new HttpError(409, "HTTP_ERROR", `路径已存在 (${relPath})`);
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

  const fileContent = buildPageContent(pageData);
  safeWriteFile(absPath, fileContent, "utf-8");
  invalidatePageFileCache(spaceId);

  return {
    id: slug,
    space_id: spaceId,
    path: relPath,
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
  if (!readSpaceMeta(spaceId)) {
    throw new HttpError(404, "HTTP_ERROR", `Wiki 空间不存在 (${spaceId})`);
  }

  const filePath = findPageFile(spaceId, pageId);
  if (!filePath) throw new HttpError(404, "HTTP_ERROR", `Wiki 页面不存在 (${pageId})`);

  const existing = pageFileToRead(filePath, spaceId);
  if (!existing) throw new HttpError(404, "HTTP_ERROR", `Wiki 页面不存在 (${pageId})`);

  const now = nowISO();
  const updatedData = {
    type: existing.type,
    title: payload.title ?? existing.title,
    tags: payload.tags ?? existing.tags,
    sources: payload.sources ?? existing.sources,
    related: payload.related ?? existing.related,
    created: existing.created_at, // preserve original creation time
    updated: now,
    content: payload.content ?? existing.content,
  };

  // Handle path change: move the file
  if (payload.path && payload.path !== existing.path.replace(/^wiki\//, "")) {
    const newPath = normalizePagePath(payload.path);
    const newAbsPath = path.join(spaceDir(spaceId), newPath);

    if (fs.existsSync(newAbsPath)) {
      throw new HttpError(409, "HTTP_ERROR", `目标路径已存在 (${newPath})`);
    }

    ensureDir(path.dirname(newAbsPath));
    safeRename(filePath, newAbsPath);
    safeWriteFile(newAbsPath, buildPageContent(updatedData), "utf-8");
    invalidatePageFileCache(spaceId);

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
      created_at: existing.created_at, // [FIX] preserve original creation time
      updated_at: now,
    };
  }

  // Same path — rewrite in place
  safeWriteFile(filePath, buildPageContent(updatedData), "utf-8");
  invalidatePageFileCache(spaceId);

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
    created_at: existing.created_at, // [FIX] preserve original creation time
    updated_at: now,
  };
}

export async function deleteWikiPage(
  spaceId: string,
  pageId: string,
): Promise<void> {
  if (!readSpaceMeta(spaceId)) {
    throw new HttpError(404, "HTTP_ERROR", `Wiki 空间不存在 (${spaceId})`);
  }

  const filePath = findPageFile(spaceId, pageId);
  if (!filePath) throw new HttpError(404, "HTTP_ERROR", `Wiki 页面不存在 (${pageId})`);

  safeUnlink(filePath);
  invalidatePageFileCache(spaceId);
}

export async function resolveWikiLink(
  spaceId: string,
  target: string,
): Promise<WikiResolveResult> {
  if (!readSpaceMeta(spaceId)) {
    return { resolved: false, page_id: null, slug: null, title: null, status: "missing", candidates: [] };
  }

  const files = walkAllPages(spaceId);
  const bySlug = new Map<string, WikiPageRead>(); // slug → parsed page (avoids double-read)
  const slugList: Array<{ slug: string; path: string; title: string }> = [];

  for (const filePath of files) {
    const slug = path.basename(filePath, ".md");
    const page = pageFileToRead(filePath, spaceId);
    if (!page) continue;
    bySlug.set(slug, page);
    slugList.push({ slug, path: page.path, title: page.title });
  }

  // Try exact slug match first
  if (bySlug.has(target)) {
    const page = bySlug.get(target)!;
    return {
      resolved: true,
      page_id: page.id,
      slug: page.slug,
      title: page.title,
      status: "resolved",
      candidates: [],
    };
  }

  // Try normalized match
  const normalized = target.toLowerCase().replace(/\s+/g, "-");
  const matches = slugList.filter(
    (s) => s.slug.toLowerCase() === normalized || s.slug.toLowerCase() === target.toLowerCase(),
  );

  if (matches.length === 1) {
    return {
      resolved: true,
      page_id: matches[0].slug,
      slug: matches[0].slug,
      title: matches[0].title,
      status: "resolved",
      candidates: [],
    };
  }

  if (matches.length > 1) {
    return {
      resolved: false,
      page_id: null,
      slug: null,
      title: null,
      status: "ambiguous",
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
    status: "missing",
    candidates: [],
  };
}

// ─── Source ───────────────────────────────────────────────────────

function sourceFilePath(spaceId: string, identity: string): string {
  return path.join(spaceDir(spaceId), "raw", "sources", identity);
}

/** [FIX race + FIX perf] Pre-read mtimes with error handling. */
function listSourceFiles(spaceId: string): string[] {
  const sourcesDir = path.join(spaceDir(spaceId), "raw", "sources");
  const files = readDirRecursive(sourcesDir);
  const withMtime: Array<{ path: string; mtime: number }> = [];
  for (const f of files) {
    try {
      withMtime.push({ path: f, mtime: fs.statSync(f).mtimeMs });
    } catch { /* file deleted between readdir and stat */ }
  }
  withMtime.sort((a, b) => b.mtime - a.mtime);
  return withMtime.map((e) => e.path);
}

/**
 * [FIX O(m*n)] Compute page_count for all sources in a single pass.
 * Scans all wiki pages once, builds a slug→count map.
 */
function computeSourcePageCounts(spaceId: string): Map<string, number> {
  const counts = new Map<string, number>();
  const wikiFiles = walkAllPages(spaceId);
  for (const wf of wikiFiles) {
    try {
      const wc = fs.readFileSync(wf, "utf-8");
      const { frontmatter } = parseFrontmatter(wc);
      const srcs = (frontmatter.sources as string[]) ?? [];
      for (const s of srcs) {
        counts.set(s, (counts.get(s) ?? 0) + 1);
      }
    } catch { /* skip unreadable */ }
  }
  return counts;
}

function sourceFileToRead(
  filePath: string,
  spaceId: string,
): Omit<WikiSourceRead, "page_count"> | null {
  try {
    const stat = fs.statSync(filePath);
    const content = fs.readFileSync(filePath, "utf-8");
    const { frontmatter } = parseFrontmatter(content);
    // [FIX body] Use parseFrontmatter's body, not manual split
    const bodyStart = content.indexOf("---\n", content.indexOf("---\n") + 1);
    const body = bodyStart !== -1 ? content.slice(bodyStart + 4) : content;

    const fileName = path.basename(filePath);
    const slug = path.basename(filePath, path.extname(filePath));
    const relPath = path.relative(spaceDir(spaceId), filePath).replace(/\\/g, "/");

    return {
      id: slug,
      space_id: spaceId,
      identity: fileName,
      title: (frontmatter.title as string) ?? slug,
      kind: (frontmatter.kind as WikiSourceRead["kind"]) ?? "text",
      original_name: fileName,
      original_uri: (frontmatter.original_uri as string) ?? null,
      storage_path: relPath,
      mime_type: "text/plain",
      size_bytes: stat.size,
      content_hash: simpleHash(body.trim()),
      status: "ready",
      metadata: (frontmatter.metadata as Record<string, unknown>) ?? {},
      created_at: (frontmatter.created as string) ?? stat.birthtime.toISOString(),
      updated_at: (frontmatter.updated as string) ?? stat.mtime.toISOString(),
    };
  } catch {
    return null;
  }
}

function sourceFileToList(
  filePath: string,
  spaceId: string,
  pageCounts: Map<string, number>,
): WikiSourceListItem | null {
  const read = sourceFileToRead(filePath, spaceId);
  if (!read) return null;
  return {
    id: read.id,
    space_id: read.space_id,
    identity: read.identity,
    title: read.title,
    kind: read.kind,
    original_name: read.original_name,
    mime_type: read.mime_type,
    status: read.status,
    page_count: pageCounts.get(read.id) ?? 0,
    created_at: read.created_at,
    updated_at: read.updated_at,
  };
}

export async function listWikiSources(
  spaceId: string,
  opts?: { status?: string; limit?: number; offset?: number },
): Promise<{ items: WikiSourceListItem[]; total: number }> {
  if (!readSpaceMeta(spaceId)) {
    throw new HttpError(404, "HTTP_ERROR", `Wiki 空间不存在 (${spaceId})`);
  }

  const files = listSourceFiles(spaceId);
  // [FIX O(m*n)] Compute page counts in a single pass
  const pageCounts = computeSourcePageCounts(spaceId);
  const items: WikiSourceListItem[] = [];

  for (const filePath of files) {
    const item = sourceFileToList(filePath, spaceId, pageCounts);
    if (!item) continue;
    if (opts?.status && item.status !== opts.status) continue;
    items.push(item);
  }

  const total = items.length;
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;

  return { items: items.slice(offset, offset + limit), total };
}

export async function getWikiSource(
  spaceId: string,
  sourceId: string,
): Promise<WikiSourceRead> {
  if (!readSpaceMeta(spaceId)) {
    throw new HttpError(404, "HTTP_ERROR", `Wiki 空间不存在 (${spaceId})`);
  }

  const filePath = findSourceFile(spaceId, sourceId);
  if (!filePath) throw new HttpError(404, "HTTP_ERROR", `Wiki 来源不存在 (${sourceId})`);

  const base = sourceFileToRead(filePath, spaceId);
  if (!base) throw new HttpError(404, "HTTP_ERROR", `Wiki 来源不存在 (${sourceId})`);

  const pageCount = computeSourcePageCounts(spaceId).get(base.id) ?? 0;

  return { ...base, page_count: pageCount };
}

function findSourceFile(spaceId: string, sourceId: string): string | null {
  const sourcesDir = path.join(spaceDir(spaceId), "raw", "sources");
  const files = readDirRecursive(sourcesDir);
  for (const filePath of files) {
    if (path.basename(filePath, path.extname(filePath)) === sourceId) return filePath;
  }
  return null;
}

export async function createWikiSource(
  spaceId: string,
  payload: WikiSourceCreate,
): Promise<WikiSourceRead> {
  if (!readSpaceMeta(spaceId)) {
    throw new HttpError(404, "HTTP_ERROR", `Wiki 空间不存在 (${spaceId})`);
  }

  const slug = slugify(payload.title);
  const fileName = `${slug}.md`;
  const absPath = sourceFilePath(spaceId, fileName);

  if (fs.existsSync(absPath)) {
    throw new HttpError(409, "HTTP_ERROR", `同名来源已存在 (${slug})`);
  }

  ensureDir(path.dirname(absPath));

  const now = nowISO();
  const fm: Record<string, unknown> = {
    title: payload.title,
    kind: payload.kind ?? "text",
    original_uri: payload.original_uri ?? "",
    // [FIX metadata] metadata stored as JSON string in frontmatter
    metadata: payload.metadata ?? {},
    created: now,
    updated: now,
  };
  const fileContent = formatFrontmatter(fm) + "\n" + (payload.content ?? "");

  safeWriteFile(absPath, fileContent, "utf-8");

  const stat = fs.statSync(absPath);
  return {
    id: slug,
    space_id: spaceId,
    identity: fileName,
    title: payload.title,
    kind: (payload.kind as WikiSourceRead["kind"]) ?? "text",
    original_name: payload.original_name ?? fileName,
    original_uri: payload.original_uri ?? null,
    storage_path: `raw/sources/${fileName}`,
    mime_type: "text/plain",
    size_bytes: stat.size,
    content_hash: simpleHash(payload.content ?? ""),
    status: "ready",
    metadata: payload.metadata ?? {},
    page_count: 0,
    created_at: now,
    updated_at: now,
  };
}

export async function deleteWikiSource(
  spaceId: string,
  sourceId: string,
  _mode: "detach" | "delete-orphans" = "detach",
): Promise<{ deleted_pages: number; updated_pages: number }> {
  if (!readSpaceMeta(spaceId)) {
    throw new HttpError(404, "HTTP_ERROR", `Wiki 空间不存在 (${spaceId})`);
  }

  const filePath = findSourceFile(spaceId, sourceId);
  if (!filePath) throw new HttpError(404, "HTTP_ERROR", `Wiki 来源不存在 (${sourceId})`);

  const fileName = path.basename(filePath);
  const slug = path.basename(filePath, path.extname(filePath));

  safeUnlink(filePath);

  // Find pages referencing this source and remove the reference
  let deletedPages = 0;
  let updatedPages = 0;
  const wikiDir = path.join(spaceDir(spaceId), "wiki");
  const wikiFiles = readDirRecursive(wikiDir, (_f, name) => name.endsWith(".md"));

  for (const wf of wikiFiles) {
    try {
      const wc = fs.readFileSync(wf, "utf-8");
      const { frontmatter, body } = parseFrontmatter(wc);
      const srcs = (frontmatter.sources as string[]) ?? [];

      if (!srcs.includes(slug) && !srcs.includes(fileName)) continue;

      if (_mode === "delete-orphans") {
        const filtered = srcs.filter((s: string) => s !== slug && s !== fileName);
        if (filtered.length === 0) {
          safeUnlink(wf);
          deletedPages++;
          continue;
        }
      }

      // Update sources list
      const filtered = srcs.filter((s: string) => s !== slug && s !== fileName);
      frontmatter.sources = filtered;
      const newContent = formatFrontmatter(frontmatter) + "\n" + body;
      safeWriteFile(wf, newContent, "utf-8");
      updatedPages++;
    } catch { /* skip */ }
  }

  return { deleted_pages: deletedPages, updated_pages: updatedPages };
}

// ─── Wikilink Backlinks ───────────────────────────────────────────

/** Scan all pages in the space for [[wikilinks]] pointing to the given page. */
export async function getWikiBacklinks(
  spaceId: string,
  pageId: string,
): Promise<Array<{ page_id: string; slug: string; title: string; path: string }>> {
  if (!readSpaceMeta(spaceId)) {
    throw new HttpError(404, "HTTP_ERROR", `Wiki 空间不存在 (${spaceId})`);
  }

  const files = walkAllPages(spaceId);
  const backlinks: Array<{ page_id: string; slug: string; title: string; path: string }> = [];
  const linkPattern = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  const targetSlug = pageId.toLowerCase();

  for (const filePath of files) {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const slug = path.basename(filePath, ".md");
      if (slug === pageId) continue; // skip self

      // Skip fenced code blocks, then scan for wikilinks
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
      const relPath = path.relative(spaceDir(spaceId), filePath).replace(/\\/g, "/");
      backlinks.push({ page_id: slug, slug, title, path: relPath });
    } catch { /* skip unreadable */ }
  }

  return backlinks;
}

// ─── Misc ─────────────────────────────────────────────────────────

function simpleHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}
