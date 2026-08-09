import path from "node:path";
import { normalizeConceptPath } from "@feedmind/wiki-core";
import { apiEnv } from "../../../../env.js";
import { HttpError } from "../../../../lib/http.js";

// 上溯 7 级：internal → space-fs → wiki → modules → src → api → apps → 项目根
const PROJECT_ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..", "..", "..", "..");

const SPACE_ID_RE = /^[\p{L}\p{N}_-]+$/u;

export function validateSpaceId(spaceId: string): void {
  if (
    !spaceId ||
    !SPACE_ID_RE.test(spaceId) ||
    spaceId.includes("..") ||
    spaceId.includes("/") ||
    spaceId.includes("\\")
  ) {
    throw new HttpError(400, "VALIDATION_ERROR", `无效的 spaceId: ${spaceId}`);
  }
}

export function getWikiRootDir(): string {
  return apiEnv.WIKI_DIR
    ? path.resolve(PROJECT_ROOT, apiEnv.WIKI_DIR)
    : path.join(PROJECT_ROOT, "data", "wiki");
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
      err instanceof Error ? err.message : "Invalid OKF concept path",
    );
  }
}
