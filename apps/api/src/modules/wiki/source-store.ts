import fs from "node:fs";
import path from "node:path";
import {
  conceptIdFromPath,
  extractDocument,
  extractSources,
  extractString,
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

/** 上传文件类型分类与大小上限（业务不变量，任何上传入口统一执行） */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const TEXT_EXTS = new Set(["md", "txt", "html", "htm", "csv", "json", "yaml", "yml", "xml", "rtf"]);
const BINARY_EXTS = new Set(["pdf", "doc", "docx", "pptx", "xlsx", "xls", "odt", "odp", "ods"]);
const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg"]);
const IMAGE_MIME_MAP: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

// 文件名净化：只保留安全字符与单个扩展名，防止路径穿越与重名污染
function sanitizeFileName(name: string): string {
  const normalized = name.replace(/\\/g, "/");
  const parts = normalized.split("/");
  const base = parts[parts.length - 1] ?? name;
  return (
    base
      .replace(/[^a-zA-Z0-9一-鿿._-]/g, "")
      .replace(/^\.+/, "")
      .replace(/\.{2,}/g, ".") || "untitled"
  );
}

function slugFromName(name: string): string {
  const stem = name.includes(".") ? name.slice(0, name.lastIndexOf(".")) : name;
  return (
    stem
      .toLowerCase()
      .replace(/[^a-z0-9一-鿿-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "untitled"
  );
}

/**
 * 落盘上传的源文件并生成可导入的 .md 源：文本原文写入；二进制临时落盘提取后清理；
 * 图片存入 raw/assets 并在 sources 生成引用。返回与列表一致的 WikiSourceRead。
 */
export async function saveUploadedSource(
  spaceId: string,
  fileName: string,
  bytes: Uint8Array,
): Promise<WikiSourceRead> {
  if (bytes.length > MAX_UPLOAD_BYTES) {
    throw new HttpError(413, "HTTP_ERROR", `文件大小超过 10MB 限制: ${fileName}`);
  }
  const safeName = sanitizeFileName(fileName);
  const ext = safeName.includes(".") ? (safeName.split(".").pop()?.toLowerCase() ?? "") : "";
  const slug = slugFromName(safeName);
  const sourceFileName = `${slug}.md`;

  const sourcesDir = path.join(getSpaceDir(spaceId), "raw", "sources");
  ensureDir(sourcesDir);
  const now = nowISO();

  if (TEXT_EXTS.has(ext)) {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    const fm = buildSourceFrontmatter(safeName, "file", now, {
      resource: safeName,
      original_name: safeName,
      original_uri: safeName,
      mime_type: ext === "md" ? "text/markdown" : `text/${ext}`,
      size_bytes: bytes.length,
      import_ext: ext,
    });
    safeWriteFile(path.join(sourcesDir, sourceFileName), formatFrontmatter(fm) + "\n" + text);
    return readUploadedSource(
      spaceId,
      sourceFileName,
      slug,
      safeName,
      "file",
      now,
      ext === "md" ? "text/markdown" : `text/${ext}`,
      text,
    );
  }

  if (BINARY_EXTS.has(ext)) {
    const binPath = path.join(sourcesDir, safeName);
    fs.writeFileSync(binPath, Buffer.from(bytes));
    let extractedText: string;
    let docMime = "application/octet-stream";
    let warnings: string[] = [];
    try {
      const doc = await extractDocument(binPath, safeName);
      extractedText = doc.text;
      docMime = doc.mimeType;
      warnings = doc.warnings;
    } catch (err) {
      extractedText = `[提取失败: ${err instanceof Error ? err.message : String(err)}]`;
    } finally {
      // 无论提取成功与否，都清理临时二进制文件
      safeUnlink(binPath);
    }
    const fm = buildSourceFrontmatter(safeName, "file", now, {
      resource: safeName,
      original_name: safeName,
      original_uri: safeName,
      mime_type: docMime,
      size_bytes: bytes.length,
      status: "ready",
      import_ext: ext,
    });
    safeWriteFile(
      path.join(sourcesDir, sourceFileName),
      formatFrontmatter(fm) + "\n" + extractedText,
    );
    return readUploadedSource(
      spaceId,
      sourceFileName,
      slug,
      safeName,
      "file",
      now,
      docMime,
      extractedText,
      { import_ext: ext, extract_warnings: warnings },
    );
  }

  if (IMAGE_EXTS.has(ext)) {
    const assetsDir = path.join(getSpaceDir(spaceId), "raw", "assets");
    ensureDir(assetsDir);
    const assetPath = path.join(assetsDir, safeName);
    fs.writeFileSync(assetPath, Buffer.from(bytes));
    const imageMime = IMAGE_MIME_MAP[ext] ?? "application/octet-stream";
    const imageMarkdown = `![${safeName}](../assets/${safeName})`;
    const fm = buildSourceFrontmatter(safeName, "image", now, {
      resource: safeName,
      original_name: safeName,
      original_uri: safeName,
      mime_type: imageMime,
      size_bytes: bytes.length,
      status: "ready",
      import_ext: ext,
    });
    safeWriteFile(
      path.join(sourcesDir, sourceFileName),
      formatFrontmatter(fm) + "\n" + imageMarkdown,
    );
    return readUploadedSource(
      spaceId,
      sourceFileName,
      slug,
      safeName,
      "image",
      now,
      imageMime,
      imageMarkdown,
      {
        import_ext: ext,
        asset_path: `raw/assets/${safeName}`,
      },
    );
  }

  throw new HttpError(400, "HTTP_ERROR", `不支持的文件类型: .${ext}`);
}

// 读取刚落盘的源文件并组装响应结构（与列表/详情读取保持一致）
// kind 沿用历史 "file"/"image" 标记（image 为图片引用源，已入 contracts 枚举）
function readUploadedSource(
  spaceId: string,
  sourceFileName: string,
  slug: string,
  title: string,
  kind: "file" | "image",
  now: string,
  mimeType: string,
  contentHashInput: string,
  metadata: Record<string, unknown> = {},
): WikiSourceRead {
  const stat = fs.statSync(path.join(getSpaceDir(spaceId), "raw", "sources", sourceFileName));
  return {
    id: slug,
    space_id: spaceId,
    identity: sourceFileName,
    title,
    kind,
    original_name: title,
    original_uri: title,
    storage_path: `raw/sources/${sourceFileName}`,
    mime_type: mimeType,
    size_bytes: stat.size,
    content_hash: sha256(contentHashInput),
    status: "ready",
    metadata,
    page_count: 0,
    created_at: now,
    updated_at: now,
  };
}

/** 导入成功后回写来源 frontmatter，供来源列表区分"待导入/已摄入"。 */
export function markSourceIngested(spaceId: string, sourcePath: string): void {
  const filePath = getSourceFilePath(spaceId, path.basename(sourcePath));
  if (!fs.existsSync(filePath)) return;
  try {
    const { frontmatter, body } = parseFrontmatter(fs.readFileSync(filePath, "utf-8"));
    if (extractString(frontmatter, "status") === "ingested") return;
    frontmatter["status"] = "ingested";
    frontmatter["timestamp"] = nowISO();
    safeWriteFile(filePath, formatFrontmatter(frontmatter) + "\n" + body);
  } catch {
    // 状态回写失败不阻塞导入结果
  }
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
  if (!filePath)
    throw new HttpError(
      404,
      "HTTP_ERROR",
      "来源文件不存在",
      {},
      { i18nKey: "apiError.sourceNotFound" },
    );

  const base = readSource(filePath, spaceId) as unknown as Omit<
    WikiSourceRead,
    "page_count"
  > | null;
  if (!base)
    throw new HttpError(
      404,
      "HTTP_ERROR",
      "来源文件不存在",
      {},
      { i18nKey: "apiError.sourceNotFound" },
    );

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
    throw new HttpError(
      409,
      "HTTP_ERROR",
      "同名来源文件已存在",
      {},
      { i18nKey: "apiError.sourceExists" },
    );
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
  if (!filePath)
    throw new HttpError(
      404,
      "HTTP_ERROR",
      "来源文件不存在",
      {},
      { i18nKey: "apiError.sourceNotFound" },
    );

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
      const srcs = extractSources(frontmatter);
      const references = srcs.map((s) => s.resource);

      if (!references.includes(slug) && !references.includes(fileName)) continue;

      if (_mode === "delete-orphans") {
        const filtered = srcs.filter((s) => s.resource !== slug && s.resource !== fileName);
        if (filtered.length === 0) {
          safeUnlink(wf);
          deletedPages++;
          deletedConceptIds.add(conceptIdFromPath(path.relative(wikiDir, wf).replace(/\\/g, "/")));
          continue;
        }
      }

      const filtered = srcs.filter((s) => s.resource !== slug && s.resource !== fileName);
      if (filtered.length > 0) frontmatter["sources"] = filtered;
      else delete frontmatter["sources"];
      delete frontmatter["provenance"];
      safeWriteFile(wf, formatFrontmatter(frontmatter) + "\n" + body);
      updatedPages++;
    } catch {
      /* 单个页面处理失败不阻塞来源删除 */
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
      const references = extractSources(frontmatter).map((s) => s.resource);
      if (!references.includes(slug) && !references.includes(fileName)) {
        unaffected++;
        continue;
      }
      const filtered = references.filter((s) => s !== slug && s !== fileName);
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
      if (filteredRelated.length !== related.length) nextFrontmatter["related"] = filteredRelated;
      if (cleanedBody !== parsed.body || filteredRelated.length !== related.length) {
        safeWriteFile(filePath, formatFrontmatter(nextFrontmatter) + "\n" + cleanedBody);
      }
    } catch {
      /* 单个页面清理失败不阻塞来源删除。 */
    }
  }
}
