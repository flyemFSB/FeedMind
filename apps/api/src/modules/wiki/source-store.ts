import fs from "node:fs";
import path from "node:path";
import {
  conceptIdFromPath,
  extractSourceReferences,
  extractStringArray,
  formatFrontmatter,
  parseFrontmatter,
  resolveConceptLink,
} from "@feedmind/wiki-core";
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
  getSpaceDir,
  walkSources,
  readSource,
  readSourceListItem,
  findSourceBySlug,
  getSourceFilePath,
  sourcePageCounts,
  isSystemFile,
} from "./space-fs/index.js";
import { appendOkfLog, rebuildOkfIndexes } from "./okf-ops.js";
import { removeIngestCache } from "./ingest-pipeline.js";

export function buildSourceFrontmatter(
  title: string,
  kind: string,
  timestamp: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    type: "Reference",
    title,
    description: `导入来源：${title}`,
    resource: title,
    tags: [],
    timestamp,
    kind,
    ...extra,
  };
}

export async function listWikiSources(
  spaceId: string,
  opts?: { status?: string; limit?: number; offset?: number },
): Promise<{ items: WikiSourceListItem[]; total: number }> {
  const files = walkSources(spaceId);
  const pageCounts = sourcePageCounts(spaceId);
  const items: WikiSourceListItem[] = [];

  for (const filePath of files) {
    const data = readSourceListItem(filePath, spaceId, pageCounts);
    if (!data) continue;
    const item = data as unknown as WikiSourceListItem;
    if (opts?.status && item.status !== opts.status) continue;
    items.push(item);
  }

  const total = items.length;
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;
  return { items: items.slice(offset, offset + limit), total };
}

export async function getWikiSource(spaceId: string, sourceId: string): Promise<WikiSourceRead> {
  const filePath = findSourceBySlug(spaceId, sourceId);
  if (!filePath) throw new HttpError(404, "HTTP_ERROR", `Wiki source does not exist (${sourceId})`);

  const base = readSource(filePath, spaceId) as unknown as Omit<
    WikiSourceRead,
    "page_count"
  > | null;
  if (!base) throw new HttpError(404, "HTTP_ERROR", `Wiki source does not exist (${sourceId})`);

  const pageCounts = sourcePageCounts(spaceId);
  const pageCount =
    pageCounts.get(base.id as string) ?? pageCounts.get(base.identity as string) ?? 0;
  return { ...base, page_count: pageCount };
}

export async function createWikiSource(
  spaceId: string,
  payload: WikiSourceCreate,
): Promise<WikiSourceRead> {
  const slug = slugify(payload.title);
  const fileName = `${slug}.md`;
  const absPath = getSourceFilePath(spaceId, fileName);

  if (fs.existsSync(absPath)) {
    throw new HttpError(409, "HTTP_ERROR", `Source with same name already exists (${slug})`);
  }

  ensureDir(path.dirname(absPath));

  const now = nowISO();
  const fm = buildSourceFrontmatter(payload.title, payload.kind ?? "text", now, {
    resource: payload.original_uri ?? "",
    original_uri: payload.original_uri ?? "",
    metadata: payload.metadata ?? {},
  });
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
  const filePath = findSourceBySlug(spaceId, sourceId);
  if (!filePath) throw new HttpError(404, "HTTP_ERROR", `Wiki source does not exist (${sourceId})`);

  const fileName = path.basename(filePath);
  const slug = path.basename(filePath, path.extname(filePath));

  safeUnlink(filePath);

  let deletedPages = 0;
  let updatedPages = 0;
  const deletedConceptIds = new Set<string>();
  const wikiDir = path.join(getSpaceDir(spaceId), "wiki");
  const wikiFiles = readDirRecursive(
    wikiDir,
    (_f, name) => name.toLowerCase().endsWith(".md") && !isSystemFile(name),
  );

  for (const wf of wikiFiles) {
    try {
      const wc = fs.readFileSync(wf, "utf-8");
      const { frontmatter, body } = parseFrontmatter(wc);
      const srcs = extractSourceReferences(frontmatter);

      if (!srcs.includes(slug) && !srcs.includes(fileName)) continue;

      if (_mode === "delete-orphans") {
        const filtered = srcs.filter((s: string) => s !== slug && s !== fileName);
        if (filtered.length === 0) {
          safeUnlink(wf);
          deletedPages++;
          deletedConceptIds.add(conceptIdFromPath(path.relative(wikiDir, wf).replace(/\\/g, "/")));
          continue;
        }
      }

      const filtered = srcs.filter((s: string) => s !== slug && s !== fileName);
      frontmatter.provenance = filtered;
      delete frontmatter.sources;
      safeWriteFile(wf, formatFrontmatter(frontmatter) + "\n" + body);
      updatedPages++;
    } catch {
      /* skip */
    }
  }

  cleanDeletedConceptLinks(wikiDir, deletedConceptIds);
  removeIngestCache(spaceId, slug);
  removeIngestCache(spaceId, fileName);
  rebuildOkfIndexes(spaceId);
  appendOkfLog(
    spaceId,
    `删除来源“${slug}”：删除 ${deletedPages} 个概念，更新 ${updatedPages} 个概念。`,
  );

  return { deleted_pages: deletedPages, updated_pages: updatedPages };
}

export async function previewDeleteImpact(
  spaceId: string,
  sourceId: string,
): Promise<{ willDelete: string[]; willUpdate: string[]; unaffected: number }> {
  const filePath = findSourceBySlug(spaceId, sourceId);
  if (!filePath) return { willDelete: [], willUpdate: [], unaffected: 0 };

  const fileName = path.basename(filePath);
  const slug = path.basename(filePath, path.extname(filePath));
  const wikiDir = path.join(getSpaceDir(spaceId), "wiki");
  const wikiFiles = readDirRecursive(
    wikiDir,
    (_f, name) => name.toLowerCase().endsWith(".md") && !isSystemFile(name),
  );

  const willDelete: string[] = [];
  const willUpdate: string[] = [];
  let unaffected = 0;

  for (const wf of wikiFiles) {
    try {
      const content = fs.readFileSync(wf, "utf-8");
      const { frontmatter } = parseFrontmatter(content);
      const srcs = extractSourceReferences(frontmatter);
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

function cleanDeletedConceptLinks(wikiDir: string, deletedConceptIds: Set<string>): void {
  if (deletedConceptIds.size === 0) return;

  const wikiFiles = readDirRecursive(
    wikiDir,
    (_f, name) => name.toLowerCase().endsWith(".md") && !isSystemFile(name),
  );

  for (const filePath of wikiFiles) {
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = parseFrontmatter(raw);
      const currentId = conceptIdFromPath(path.relative(wikiDir, filePath).replace(/\\/g, "/"));
      const cleanedBody = parsed.body.replace(
        /(?<!!)\[([^\]]+)\]\(\s*(<[^>]+>|[^)\s]+)(?:\s+["'][^)]*["'])?\s*\)/g,
        (match, label: string, rawTarget: string) => {
          const target = rawTarget.startsWith("<") ? rawTarget.slice(1, -1) : rawTarget;
          const targetId = resolveConceptLink(currentId, target);
          return targetId && deletedConceptIds.has(targetId) ? label : match;
        },
      );
      const related = extractStringArray(parsed.frontmatter, "related");
      const filteredRelated = related.filter(
        (id) => !deletedConceptIds.has(id.replace(/\.md$/i, "")),
      );
      const nextFrontmatter = { ...parsed.frontmatter };
      if (filteredRelated.length !== related.length) nextFrontmatter.related = filteredRelated;
      if (cleanedBody !== parsed.body || filteredRelated.length !== related.length) {
        safeWriteFile(filePath, formatFrontmatter(nextFrontmatter) + "\n" + cleanedBody);
      }
    } catch {
      /* 单个页面清理失败不阻塞来源删除。 */
    }
  }
}
