import fs from "node:fs";
import path from "node:path";
import { formatFrontmatter, parseFrontmatter } from "@feedmind/wiki-core";
import type { WikiSourceCreate, WikiSourceListItem, WikiSourceRead } from "@feedmind/contracts";
import { HttpError } from "../../lib/http.js";
import {
  ensureDir,
  nowISO,
  readDirRecursive,
  safeUnlink,
  safeWriteFile,
  sha256,
  slugify,
  spaceDir,
} from "./wiki-utils.js";

// ─── 源文件辅助函数 ─────────────────────────────────────────────

function sourceFilePath(spaceId: string, identity: string): string {
  return path.join(spaceDir(spaceId), "raw", "sources", identity);
}

function listSourceFiles(spaceId: string): string[] {
  const sourcesDir = path.join(spaceDir(spaceId), "raw", "sources");
  const files = readDirRecursive(sourcesDir);
  const withMtime: Array<{ path: string; mtime: number }> = [];
  for (const f of files) {
    try {
      withMtime.push({ path: f, mtime: fs.statSync(f).mtimeMs });
    } catch {
      /* file deleted between readdir and stat */
    }
  }
  withMtime.sort((a, b) => b.mtime - a.mtime);
  return withMtime.map((e) => e.path);
}

function computeSourcePageCounts(spaceId: string): Map<string, number> {
  const counts = new Map<string, number>();
  const wikiDir = path.join(spaceDir(spaceId), "wiki");
  const wikiFiles = readDirRecursive(wikiDir, (_f, name) => name.endsWith(".md"));
  for (const wf of wikiFiles) {
    try {
      const wc = fs.readFileSync(wf, "utf-8");
      const { frontmatter } = parseFrontmatter(wc);
      const srcs = (frontmatter.sources as string[]) ?? [];
      for (const s of srcs) {
        counts.set(s, (counts.get(s) ?? 0) + 1);
      }
    } catch {
      /* skip unreadable */
    }
  }
  return counts;
}

function findSourceFile(spaceId: string, sourceId: string): string | null {
  const sourcesDir = path.join(spaceDir(spaceId), "raw", "sources");
  const files = readDirRecursive(sourcesDir);
  for (const filePath of files) {
    if (path.basename(filePath, path.extname(filePath)) === sourceId) return filePath;
  }
  return null;
}

function sourceFileToRead(
  filePath: string,
  spaceId: string,
): Omit<WikiSourceRead, "page_count"> | null {
  try {
    const stat = fs.statSync(filePath);
    const content = fs.readFileSync(filePath, "utf-8");
    const { frontmatter } = parseFrontmatter(content);
    const bodyStart = content.indexOf("---\n", content.indexOf("---\n") + 1);
    const body = bodyStart !== -1 ? content.slice(bodyStart + 4) : content;

    const fileName = path.basename(filePath);
    const slug = path.basename(filePath, path.extname(filePath));

    return {
      id: slug,
      space_id: spaceId,
      identity: fileName,
      title: (frontmatter.title as string) ?? slug,
      kind: (frontmatter.kind as WikiSourceRead["kind"]) ?? "text",
      original_name: fileName,
      original_uri: (frontmatter.original_uri as string) ?? null,
      storage_path: path.relative(spaceDir(spaceId), filePath).replace(/\\/g, "/"),
      mime_type: "text/plain",
      size_bytes: stat.size,
      content_hash: sha256(body.trim()),
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

// ─── 公开 API ──────────────────────────────────────────────────

export async function listWikiSources(
  spaceId: string,
  opts?: { status?: string; limit?: number; offset?: number },
): Promise<{ items: WikiSourceListItem[]; total: number }> {
  const files = listSourceFiles(spaceId);
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

export async function getWikiSource(spaceId: string, sourceId: string): Promise<WikiSourceRead> {
  const filePath = findSourceFile(spaceId, sourceId);
  if (!filePath) throw new HttpError(404, "HTTP_ERROR", `Wiki source does not exist (${sourceId})`);

  const base = sourceFileToRead(filePath, spaceId);
  if (!base) throw new HttpError(404, "HTTP_ERROR", `Wiki source does not exist (${sourceId})`);

  const pageCount = computeSourcePageCounts(spaceId).get(base.id) ?? 0;
  return { ...base, page_count: pageCount };
}

export async function createWikiSource(
  spaceId: string,
  payload: WikiSourceCreate,
): Promise<WikiSourceRead> {
  const slug = slugify(payload.title);
  const fileName = `${slug}.md`;
  const absPath = sourceFilePath(spaceId, fileName);

  if (fs.existsSync(absPath)) {
    throw new HttpError(409, "HTTP_ERROR", `Source with same name already exists (${slug})`);
  }

  ensureDir(path.dirname(absPath));

  const now = nowISO();
  const fm: Record<string, unknown> = {
    title: payload.title,
    kind: payload.kind ?? "text",
    original_uri: payload.original_uri ?? "",
    metadata: payload.metadata ?? {},
    created: now,
    updated: now,
  };
  safeWriteFile(absPath, formatFrontmatter(fm) + "\n" + (payload.content ?? ""));

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
    content_hash: sha256(payload.content ?? ""),
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
  const filePath = findSourceFile(spaceId, sourceId);
  if (!filePath) throw new HttpError(404, "HTTP_ERROR", `Wiki source does not exist (${sourceId})`);

  const fileName = path.basename(filePath);
  const slug = path.basename(filePath, path.extname(filePath));

  safeUnlink(filePath);

  let deletedPages = 0;
  let updatedPages = 0;
  const wikiDir = path.join(spaceDir(spaceId), "wiki");
  const wikiFiles = readDirRecursive(wikiDir, (_f, name) => name.endsWith(".md"));

  const deletedSlugs: string[] = [];
  const deletedKeys = new Set<string>();

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
          const deletedSlug = path.basename(wf, ".md");
          deletedSlugs.push(deletedSlug);
          deletedKeys.add(deletedSlug.toLowerCase().replace(/[\s\-_]+/g, ""));
          continue;
        }
      }

      const filtered = srcs.filter((s: string) => s !== slug && s !== fileName);
      frontmatter.sources = filtered;
      safeWriteFile(wf, formatFrontmatter(frontmatter) + "\n" + body);
      updatedPages++;
    } catch {
      /* skip */
    }
  }

  // Clean index.md
  const indexPath = path.join(spaceDir(spaceId), "wiki", "index.md");
  if (deletedSlugs.length > 0 && fs.existsSync(indexPath)) {
    try {
      const indexContent = fs.readFileSync(indexPath, "utf-8");
      const cleaned = indexContent.split("\n").filter((line) => {
        const match = line.match(/\[\[([^\]|]+?)(?:\|[^\]]+)?\]\]/);
        if (!match) return true;
        const refSlug = match[1]
          .trim()
          .toLowerCase()
          .replace(/[\s\-_]+/g, "");
        return !deletedKeys.has(refSlug);
      });
      if (cleaned.length > 0) fs.writeFileSync(indexPath, cleaned.join("\n"), "utf-8");
    } catch {
      /* skip */
    }
  }

  // Update log.md
  const logPath = path.join(spaceDir(spaceId), "wiki", "log.md");
  try {
    let logContent = "";
    if (fs.existsSync(logPath)) logContent = fs.readFileSync(logPath, "utf-8");
    if (!logContent.trim()) logContent = "# Change Log\n\n";
    const entry = `- ${nowISO().replace("T", " ").slice(0, 16)}: Deleted source "${slug}". ${deletedPages > 0 ? `${deletedPages} orphan pages removed. ` : ""}${updatedPages > 0 ? `${updatedPages} pages updated.` : ""}\n`;
    fs.writeFileSync(logPath, logContent + entry, "utf-8");
  } catch {
    /* skip */
  }

  return { deleted_pages: deletedPages, updated_pages: updatedPages };
}

export async function previewDeleteImpact(
  spaceId: string,
  sourceId: string,
): Promise<{ willDelete: string[]; willUpdate: string[]; unaffected: number }> {
  const filePath = findSourceFile(spaceId, sourceId);
  if (!filePath) return { willDelete: [], willUpdate: [], unaffected: 0 };

  const fileName = path.basename(filePath);
  const slug = path.basename(filePath, path.extname(filePath));
  const wikiDir = path.join(spaceDir(spaceId), "wiki");
  const wikiFiles = readDirRecursive(wikiDir, (_f, name) => name.endsWith(".md"));

  const willDelete: string[] = [];
  const willUpdate: string[] = [];
  let unaffected = 0;

  for (const wf of wikiFiles) {
    try {
      const content = fs.readFileSync(wf, "utf-8");
      const { frontmatter } = parseFrontmatter(content);
      const srcs = (frontmatter.sources as string[]) ?? [];
      if (!srcs.includes(slug) && !srcs.includes(fileName)) {
        unaffected++;
        continue;
      }
      const filtered = srcs.filter((s: string) => s !== slug && s !== fileName);
      if (filtered.length === 0) willDelete.push(wf);
      else willUpdate.push(wf);
    } catch {
      unaffected++;
    }
  }

  return { willDelete, willUpdate, unaffected };
}
