import fs from "node:fs";
import path from "node:path";
import {
  conceptIdFromPath,
  extractSources,
  extractString,
  extractStringArray,
  formatFrontmatter,
  parseFrontmatter,
  resolveConceptLink,
} from "@feedmind/wiki-core";
import type { WikiSourceCreate, WikiSourceListItem, WikiSourceRead } from "@feedmind/contracts";
import { HttpError } from "../../../lib/http.js";
import {
  ensureDir,
  nowISO,
  readDirRecursive,
  safeUnlink,
  safeWriteFile,
  sha256,
  slugify,
  slugFromName,
  getSpaceDir,
  getRawSourcesDir,
  getRawUploadsDir,
  walkUploads,
  collectSourceIdentifiers,
  readSource,
  readSourceListItem,
  findSourceBySlug,
  hasDuplicateSourceName,
  getSourceFilePath,
  sourcePageCounts,
  isSystemFile,
} from "../space-fs/index.js";
import { appendOkfLog, rebuildOkfIndexes } from "./okf-ops.js";
import { removeIngestCache } from "../ingest/ingest-pipeline.js";

// ─── 后台转换支持（worker 调用）─────────────────────────────────────

/** 转换成功：用提取结果回写占位源（正文 + status ready + mime/page_count）。 */
export function writeConvertedSource(
  spaceId: string,
  slug: string,
  doc: { text: string; mimeType: string; pageCount?: number },
  imageNames: string[] = [],
): void {
  const filePath = getSourceFilePath(spaceId, `${slug}.md`);
  const raw = fs.readFileSync(filePath, "utf-8");
  const { frontmatter } = parseFrontmatter(raw);
  frontmatter["status"] = "ready";
  frontmatter["mime_type"] = doc.mimeType;
  if (doc.pageCount !== undefined) frontmatter["page_count"] = doc.pageCount;
  if (imageNames.length > 0) frontmatter["extracted_images"] = imageNames;
  safeWriteFile(filePath, formatFrontmatter(frontmatter) + "\n" + doc.text);
}

/** 转换失败：占位源标记 failed 并附带原因，列表可见失败状态。 */
export function markSourceConvertFailed(spaceId: string, slug: string, error: string): void {
  const filePath = getSourceFilePath(spaceId, `${slug}.md`);
  if (!fs.existsSync(filePath)) return;
  try {
    const { frontmatter, body } = parseFrontmatter(fs.readFileSync(filePath, "utf-8"));
    frontmatter["status"] = "failed";
    frontmatter["convert_error"] = error;
    safeWriteFile(filePath, formatFrontmatter(frontmatter) + "\n" + body);
  } catch {
    /* 标记失败不阻塞 worker */
  }
}

/** 导入失败留痕：写 frontmatter import_error 但保留 status（不锁死重试）。
 * 与转换失败（status=failed，正文无内容只能重传）区分——导入失败时正文有效，
 * worker 自动重试或用户手动“运行导入”仍可重新导入 */
export function markSourceImportFailed(spaceId: string, slug: string, error: string): void {
  const filePath = getSourceFilePath(spaceId, `${slug}.md`);
  if (!fs.existsSync(filePath)) return;
  try {
    const { frontmatter, body } = parseFrontmatter(fs.readFileSync(filePath, "utf-8"));
    frontmatter["import_error"] = error;
    safeWriteFile(filePath, formatFrontmatter(frontmatter) + "\n" + body);
  } catch {
    /* 状态回写失败不阻塞 worker */
  }
}

/**
 * VL 解析提取的内嵌图表原图落盘 raw/assets；返回落盘文件名列表供 frontmatter 记录。
 * 文件名是远端不可信输入：净化后落盘，防路径穿越与 Windows 非法字符。
 */
export function persistExtractedImages(spaceId: string, images: Map<string, string>): string[] {
  if (images.size === 0) return [];
  const assetsDir = path.join(getSpaceDir(spaceId), "raw", "assets");
  ensureDir(assetsDir);
  const names: string[] = [];
  for (const [name, dataUrl] of images) {
    const safe = sanitizeFileName(name);
    safeWriteFile(path.join(assetsDir, safe), Buffer.from(dataUrl, "base64"));
    names.push(safe);
  }
  return names;
}

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

  // 同名判重：已存在同名来源时直接拦截
  if (hasDuplicateSourceName(spaceId, safeName)) {
    throw new HttpError(
      409,
      "HTTP_ERROR",
      `同名来源文件已存在: ${safeName}`,
      {},
      { i18nKey: "apiError.sourceExists" },
    );
  }

  // 目录划分：用户上传的原始文件存 raw/uploads（来源管理的展示条目）；
  // raw/sources 只存转换/占位 md（导入输入与状态载体），不直接展示
  const uploadsDir = path.join(getSpaceDir(spaceId), "raw", "uploads");
  const sourcesDir = path.join(getSpaceDir(spaceId), "raw", "sources");
  ensureDir(uploadsDir);
  ensureDir(sourcesDir);
  const now = nowISO();
  const uploadPath = path.join(uploadsDir, safeName);

  if (TEXT_EXTS.has(ext)) {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    fs.writeFileSync(uploadPath, Buffer.from(bytes));
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
      uploadPath,
      "file",
      now,
      ext === "md" ? "text/markdown" : `text/${ext}`,
      text,
      {},
      bytes.length,
    );
  }

  if (BINARY_EXTS.has(ext)) {
    fs.writeFileSync(uploadPath, Buffer.from(bytes));
    // 不再同步提取：立即落占位源并返回，提取交给队列中的转换任务（worker 执行，
    // 见 ingest-worker），弹窗即时关闭，来源列表实时展示解析进度——VL OCR 要十几秒
    const fm = buildSourceFrontmatter(safeName, "file", now, {
      resource: safeName,
      original_name: safeName,
      original_uri: safeName,
      // 占位阶段 mime 未知（要等提取）；worker 转换完成后回写真实值
      mime_type: "application/octet-stream",
      size_bytes: bytes.length,
      status: "queued",
      import_ext: ext,
    });
    safeWriteFile(path.join(sourcesDir, sourceFileName), formatFrontmatter(fm) + "\n");
    return readUploadedSource(
      spaceId,
      sourceFileName,
      slug,
      safeName,
      uploadPath,
      "file",
      now,
      "application/octet-stream",
      `queued:${bytes.length}`,
      { import_ext: ext },
      bytes.length,
    );
  }

  if (IMAGE_EXTS.has(ext)) {
    const assetsDir = path.join(getSpaceDir(spaceId), "raw", "assets");
    ensureDir(assetsDir);
    const assetPath = path.join(assetsDir, safeName);
    fs.writeFileSync(assetPath, Buffer.from(bytes));
    fs.writeFileSync(uploadPath, Buffer.from(bytes));
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
      uploadPath,
      "image",
      now,
      imageMime,
      imageMarkdown,
      {
        import_ext: ext,
        asset_path: `raw/assets/${safeName}`,
      },
      bytes.length,
    );
  }

  throw new HttpError(400, "HTTP_ERROR", `不支持的文件类型: .${ext}`);
}

// 读取已落盘的源文件并组装响应结构
function readUploadedSource(
  spaceId: string,
  sourceFileName: string,
  slug: string,
  title: string,
  uploadPath: string,
  kind: "file" | "image",
  now: string,
  mimeType: string,
  contentHashInput: string,
  metadata: Record<string, unknown> = {},
  uploadBytes?: number | null,
): WikiSourceRead {
  const stat = fs.statSync(uploadPath);
  // 读落盘 frontmatter 状态，保留二进制占位源的 queued 状态
  const { frontmatter } = parseFrontmatter(
    fs.readFileSync(path.join(getRawSourcesDir(spaceId), sourceFileName), "utf-8"),
  );
  return {
    id: slug,
    space_id: spaceId,
    identity: sourceFileName,
    title,
    kind,
    original_name: title,
    original_uri: title,
    storage_path: path.relative(getSpaceDir(spaceId), uploadPath).replace(/\\/g, "/"),
    mime_type: mimeType,
    size_bytes: (uploadBytes ?? stat.size) as number,
    content_hash: sha256(contentHashInput),
    status: (extractString(frontmatter, "status") ?? "ready") as WikiSourceRead["status"],
    metadata,
    page_count: 0,
    created_at: now,
    updated_at: now,
  };
}

/** 导入成功后回写来源 frontmatter，供来源列表区分"待导入/已导入"。 */
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
  const files = walkUploads(spaceId);
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

  if (fs.existsSync(absPath) || hasDuplicateSourceName(spaceId, payload.title)) {
    throw new HttpError(
      409,
      "HTTP_ERROR",
      `同名来源文件已存在: ${payload.title}`,
      {},
      { i18nKey: "apiError.sourceExists" },
    );
  }

  ensureDir(path.dirname(absPath));
  // 原文存 raw/uploads，元数据存 raw/sources
  const uploadPath = path.join(getRawUploadsDir(spaceId), `${slug}.txt`);
  ensureDir(path.dirname(uploadPath));
  fs.writeFileSync(uploadPath, payload.content ?? "");

  const now = nowISO();
  const fm = buildSourceFrontmatter(payload.title, payload.kind ?? "text", now, {
    resource: payload.original_uri ?? "",
    original_uri: payload.original_uri ?? "",
    mime_type: "text/plain",
    size_bytes: Buffer.byteLength(payload.content ?? "", "utf-8"),
    metadata: payload.metadata ?? {},
  });
  safeWriteFile(absPath, formatFrontmatter(fm) + "\n" + (payload.content ?? ""));

  const stat = fs.statSync(absPath);
  return {
    id: slug,
    space_id: spaceId,
    identity: fileName,
    title: payload.title,
    kind: (payload.kind ?? "text") as WikiSourceRead["kind"],
    original_name: payload.original_name ?? fileName,
    original_uri: payload.original_uri ?? null,
    storage_path: `raw/uploads/${slug}.txt`,
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

function isSourceMatch(ref: string, identifiers: Set<string>): boolean {
  if (identifiers.has(ref)) return true;
  const base = path.basename(ref);
  if (identifiers.has(base)) return true;
  const stem = path.basename(ref, path.extname(ref));
  if (identifiers.has(stem)) return true;
  return false;
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

  const slug = path.basename(filePath, path.extname(filePath));
  const identifiers = collectSourceIdentifiers(spaceId, sourceId, filePath);

  // 删除用户上传文件 + 关联的转换/占位 md（状态载体）
  safeUnlink(filePath);
  safeUnlink(path.join(getRawSourcesDir(spaceId), `${slug}.md`));

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

      const hasMatch = srcs.some((s) => isSourceMatch(s.resource, identifiers));
      if (!hasMatch) continue;

      const filtered = srcs.filter((s) => !isSourceMatch(s.resource, identifiers));

      if (_mode === "delete-orphans" && filtered.length === 0) {
        safeUnlink(wf);
        deletedPages++;
        deletedConceptIds.add(conceptIdFromPath(path.relative(wikiDir, wf).replace(/\\/g, "/")));
        continue;
      }

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
  for (const id of identifiers) {
    removeIngestCache(spaceId, id);
  }
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

  const identifiers = collectSourceIdentifiers(spaceId, sourceId, filePath);
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
      const srcs = extractSources(frontmatter);
      const hasMatch = srcs.some((s) => isSourceMatch(s.resource, identifiers));
      if (!hasMatch) {
        unaffected++;
        continue;
      }
      const filtered = srcs.filter((s) => !isSourceMatch(s.resource, identifiers));
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
