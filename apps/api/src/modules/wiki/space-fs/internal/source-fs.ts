import fs from "node:fs";
import path from "node:path";
import { extractSources, extractString, parseFrontmatter, safeJoin } from "@feedmind/wiki-core";
import { isSystemFile, readDirRecursive, readFileSafe, sha256 } from "./io.js";
import { getSpaceDir, getRawSourcesDir, getRawUploadsDir, getWikiDir } from "./paths.js";

/** 用户上传的源文件清单（raw/uploads），按修改时间倒序 */
export function walkUploads(spaceId: string): string[] {
  const uploadsDir = getRawUploadsDir(spaceId);
  const files = readDirRecursive(uploadsDir);
  const withMtime: Array<{ path: string; mtime: number }> = [];
  for (const f of files) {
    try {
      withMtime.push({ path: f, mtime: fs.statSync(f).mtimeMs });
    } catch {
      /* readdir 与 stat 之间文件可能已被删除 */
    }
  }
  withMtime.sort((a, b) => b.mtime - a.mtime);
  return withMtime.map((e) => e.path);
}
export function sourcePageCounts(spaceId: string): Map<string, number> {
  const counts = new Map<string, number>();
  const wikiDir = getWikiDir(spaceId);
  const wikiFiles = readDirRecursive(
    wikiDir,
    (_f, name) => name.toLowerCase().endsWith(".md") && !isSystemFile(name),
  );
  for (const wf of wikiFiles) {
    try {
      const content = fs.readFileSync(wf, "utf-8");
      const { frontmatter } = parseFrontmatter(content);
      for (const s of extractSources(frontmatter)) {
        counts.set(s.resource, (counts.get(s.resource) ?? 0) + 1);
      }
    } catch {
      /* 不可读文件不计入来源页数 */
    }
  }
  return counts;
}

export function slugFromName(name: string): string {
  const stem = name.includes(".") ? name.slice(0, name.lastIndexOf(".")) : name;
  return (
    stem
      .toLowerCase()
      .replace(/[^a-z0-9一-鿿-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "untitled"
  );
}

/** 上传文件按其 slug（去扩展名）查找，优先 uploads，兜底 sources */
export function findSourceBySlug(spaceId: string, sourceId: string): string | null {
  const normId = sourceId.replace(/\.md$/i, "").trim();
  const slugId = slugFromName(normId);
  const uploadsDir = getRawUploadsDir(spaceId);
  const uploadFiles = readDirRecursive(uploadsDir);
  for (const filePath of uploadFiles) {
    const base = path.basename(filePath);
    const stem = path.basename(filePath, path.extname(filePath));
    const fileSlug = slugFromName(base);
    if (
      stem === normId ||
      base === sourceId ||
      base === `${normId}.md` ||
      fileSlug === slugId ||
      fileSlug === normId
    )
      return filePath;
  }
  const sourcesDir = getRawSourcesDir(spaceId);
  const srcFiles = readDirRecursive(sourcesDir);
  for (const filePath of srcFiles) {
    const base = path.basename(filePath);
    const stem = path.basename(filePath, path.extname(filePath));
    const fileSlug = slugFromName(base);
    if (
      stem === normId ||
      base === sourceId ||
      base === `${normId}.md` ||
      fileSlug === slugId ||
      fileSlug === normId
    )
      return filePath;
  }
  return null;
}

/**
 * 聚合来源的完整标识符集合（slug、identity、original_name、original_uri、resource、title 等）。
 * 用于 Wiki Concept 页面关联判定、删除级联清理以及引用计数。
 */
export function collectSourceIdentifiers(
  spaceId: string,
  sourceId: string,
  uploadPath?: string,
): Set<string> {
  const identifiers = new Set<string>();
  const normId = sourceId.replace(/\.md$/i, "").trim();
  if (!normId) return identifiers;

  const slugId = slugFromName(normId);
  identifiers.add(normId);
  identifiers.add(`${normId}.md`);
  identifiers.add(slugId);
  identifiers.add(`${slugId}.md`);
  identifiers.add(sourceId);

  const candidatePaths = [
    path.join(getRawSourcesDir(spaceId), `${slugId}.md`),
    path.join(getRawSourcesDir(spaceId), `${normId}.md`),
  ];
  for (const p of candidatePaths) {
    const rawMd = readFileSafe(p);
    if (!rawMd) continue;
    try {
      const { frontmatter } = parseFrontmatter(rawMd);
      const title = extractString(frontmatter, "title");
      const resource = extractString(frontmatter, "resource");
      const origName = extractString(frontmatter, "original_name");
      const origUri = extractString(frontmatter, "original_uri");
      if (title) identifiers.add(title);
      if (resource) {
        identifiers.add(resource);
        identifiers.add(path.basename(resource));
      }
      if (origName) {
        identifiers.add(origName);
        identifiers.add(path.basename(origName));
      }
      if (origUri) {
        identifiers.add(origUri);
        identifiers.add(path.basename(origUri));
      }
    } catch {
      /* 解析失败不影响基础标识符 */
    }
  }

  const effectiveUpload = uploadPath ?? findSourceBySlug(spaceId, normId);
  if (effectiveUpload) {
    const base = path.basename(effectiveUpload);
    const stem = path.basename(effectiveUpload, path.extname(effectiveUpload));
    identifiers.add(base);
    identifiers.add(stem);
    identifiers.add(slugFromName(base));
  }

  for (const id of Array.from(identifiers)) {
    if (id) {
      identifiers.add(`raw/sources/${id}`);
      identifiers.add(`raw/uploads/${id}`);
    }
  }

  return identifiers;
}

/** 来源详情：用户上传文件（raw/uploads）与关联转换 md（raw/sources）元数据的组合 */
export function readSource(uploadPath: string, spaceId: string): Record<string, unknown> | null {
  try {
    const stat = fs.statSync(uploadPath);
    const fileName = path.basename(uploadPath);
    const slug = slugFromName(fileName);
    const mdPath = path.join(getRawSourcesDir(spaceId), `${slug}.md`);
    let raw = readFileSafe(mdPath);
    if (raw === null) {
      const rawStem = path.basename(uploadPath, path.extname(uploadPath));
      const fallbackMd = path.join(getRawSourcesDir(spaceId), `${rawStem}.md`);
      raw = readFileSafe(fallbackMd) ?? "";
    }
    const { frontmatter } = parseFrontmatter(raw);
    const meta = frontmatter as Record<string, unknown>;
    return {
      id: slug,
      space_id: spaceId,
      identity: `${slug}.md`,
      title: extractString(meta, "title") ?? fileName,
      // kind 缺省按文件名推断：旧版本来源可能无 kind 字段（默认 text 会显示 T 字图标）
      kind:
        extractString(meta, "kind") ??
        (fileName.toLowerCase().includes(".pdf")
          ? "file"
          : /\.(png|jpe?g|gif|webp|svg)$/i.test(fileName)
            ? "image"
            : "text"),
      original_name: fileName,
      original_uri: (meta["original_uri"] as string) ?? fileName,
      storage_path: path.relative(getSpaceDir(spaceId), uploadPath).replace(/\\/g, "/"),
      mime_type: extractString(meta, "mime_type") ?? "application/octet-stream",
      size_bytes: stat.size,
      content_hash: sha256(raw.trim()),
      // 状态存于关联 md frontmatter（转换/导入回写），缺省待导入
      status: (extractString(meta, "status") ?? "ready") as string,
      metadata: (meta["metadata"] as Record<string, unknown>) ?? {},
      created_at: extractString(meta, "timestamp") ?? stat.birthtime.toISOString(),
      updated_at: extractString(meta, "timestamp") ?? stat.mtime.toISOString(),
    };
  } catch {
    return null;
  }
}

export function readSourceListItem(
  uploadPath: string,
  spaceId: string,
  pageCounts: Map<string, number>,
): Record<string, unknown> | null {
  const base = readSource(uploadPath, spaceId);
  if (!base) return null;
  const identifiers = collectSourceIdentifiers(spaceId, base["id"] as string, uploadPath);
  let pageCount = 0;
  for (const id of identifiers) {
    pageCount = Math.max(pageCount, pageCounts.get(id) ?? 0);
  }
  return {
    id: base["id"],
    space_id: base["space_id"],
    identity: base["identity"],
    title: base["title"],
    kind: base["kind"],
    original_name: base["original_name"],
    mime_type: base["mime_type"],
    status: base["status"],
    page_count: pageCount,
    created_at: base["created_at"],
    updated_at: base["updated_at"],
  };
}

export function readSourceTitle(spaceId: string, sourcePath: string): string {
  const sourceDir = getRawSourcesDir(spaceId);
  const sourceFilePath = safeJoin(sourceDir, sourcePath);
  const raw = readFileSafe(sourceFilePath);
  if (!raw) return "";
  try {
    const { frontmatter } = parseFrontmatter(raw);
    return extractString(frontmatter, "title") ?? "";
  } catch {
    return "";
  }
}

/**
 * 检查当前空间内是否已存在同名来源文件或同名来源
 */
export function hasDuplicateSourceName(spaceId: string, name: string): boolean {
  const cleanName = name.trim();
  if (!cleanName) return false;
  const normId = cleanName.replace(/\.md$/i, "");
  const slug = slugFromName(normId);

  const uploadsDir = getRawUploadsDir(spaceId);
  const sourcesDir = getRawSourcesDir(spaceId);

  // 1. 检查 uploads 与 sources 物理文件是否存在
  if (fs.existsSync(path.join(uploadsDir, cleanName))) return true;
  if (fs.existsSync(path.join(sourcesDir, `${slug}.md`))) return true;

  // 2. 通过 slug / 标题匹配现有来源
  return findSourceBySlug(spaceId, cleanName) !== null;
}
