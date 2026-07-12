import path from "node:path";
import { fileURLToPath } from "node:url";
import { apiEnv } from "../../../../env.js";
import { HttpError } from "../../../../lib/http.js";

const _thisDir = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(_thisDir, "..", "..", "..", "..", "..", "..");

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
  const withExt = normalized.endsWith(".md") ? normalized : `${normalized}.md`;
  const prefixed = withExt.startsWith("wiki/") ? withExt : `wiki/${withExt}`;
  const parts = prefixed.split("/");
  for (const part of parts) {
    if (part === ".." || part === "." || part.startsWith("/") || part.startsWith("\\")) {
      throw new HttpError(400, "HTTP_ERROR", "Path must not contain .. or . or be absolute");
    }
  }
  return prefixed;
}

export const TYPE_DIR_MAP: Record<string, string> = {
  entity: "entities",
  concept: "concepts",
  source: "sources",
  overview: "",
  index: "",
};

export function getScopedWikiDir(spaceId: string, typeFilter?: string): string {
  const wikiDir = getWikiDir(spaceId);
  if (typeFilter && TYPE_DIR_MAP[typeFilter] !== undefined) {
    const sub = TYPE_DIR_MAP[typeFilter];
    return sub ? path.join(wikiDir, sub) : wikiDir;
  }
  return wikiDir;
}
