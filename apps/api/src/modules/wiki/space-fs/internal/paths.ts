import path from "node:path";
import { normalizeConceptPath } from "@feedmind/wiki-core";
import { apiEnv } from "../../../../env.js";
import { resolveDataDir } from "../../../../lib/data-dir.js";
import { HttpError } from "../../../../lib/http.js";

const SPACE_ID_RE = /^[\p{L}\p{N}_-]+$/u;

export function validateSpaceId(spaceId: string): void {
  if (
    !spaceId ||
    !SPACE_ID_RE.test(spaceId) ||
    spaceId.includes("..") ||
    spaceId.includes("/") ||
    spaceId.includes("\\")
  ) {
    throw new HttpError(400, "VALIDATION_ERROR", "空间标识无效");
  }
}

export function getWikiRootDir(): string {
  // WIKI_DIR 支持显式绝对路径覆盖，默认锚定数据目录
  return apiEnv.WIKI_DIR ? path.resolve(apiEnv.WIKI_DIR) : path.join(resolveDataDir(), "wiki");
}

export function getSpaceDir(spaceId: string): string {
  validateSpaceId(spaceId);
  return path.join(getWikiRootDir(), spaceId);
}

export function getRegistryPath(): string {
  return path.join(getWikiRootDir(), "registry.json");
}

export function getSpaceMetaPath(spaceId: string): string {
  return path.join(getSpaceDir(spaceId), "space.json");
}

export function getWikiDir(spaceId: string): string {
  return path.join(getSpaceDir(spaceId), "wiki");
}

export function getRawSourcesDir(spaceId: string): string {
  return path.join(getSpaceDir(spaceId), "raw", "sources");
}

/** 用户上传的原始文件（text/二进制/图片原图），来源管理展示的就是这一目录 */
export function getRawUploadsDir(spaceId: string): string {
  return path.join(getSpaceDir(spaceId), "raw", "uploads");
}

export function getSourceFilePath(spaceId: string, identity: string): string {
  return path.join(getRawSourcesDir(spaceId), identity);
}

export function normalizePageRelPath(p: string): string {
  const normalized = p.replace(/\\/g, "/");
  const bundlePath = normalized.toLowerCase().startsWith("wiki/")
    ? normalized.slice("wiki/".length)
    : normalized;
  const withExt = bundlePath.toLowerCase().endsWith(".md") ? bundlePath : `${bundlePath}.md`;

  try {
    return `wiki/${normalizeConceptPath(withExt)}`;
  } catch (err) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      err instanceof Error ? err.message : "页面路径不合法",
    );
  }
}
