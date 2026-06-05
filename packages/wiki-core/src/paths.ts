/**
 * Normalize a path to use forward slashes (works on all platforms).
 */
export function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}

/**
 * Join path segments with forward slashes.
 */
export function joinPath(...segments: string[]): string {
  return segments
    .map((s) => s.replace(/\\/g, "/"))
    .join("/")
    .replace(/\/+/g, "/");
}

/**
 * Get the filename from a path.
 */
export function getFileName(p: string): string {
  const normalized = p.replace(/\\/g, "/");
  return normalized.split("/").pop() ?? p;
}

/**
 * Get the file stem (filename without extension).
 */
export function getFileStem(p: string): string {
  const name = getFileName(p);
  const lastDot = name.lastIndexOf(".");
  return lastDot > 0 ? name.slice(0, lastDot) : name;
}

/**
 * Get the relative path from a base path.
 */
export function getRelativePath(fullPath: string, basePath: string): string {
  const normalFull = normalizePath(fullPath);
  const normalBase = normalizePath(basePath).replace(/\/$/, "");
  if (normalFull.startsWith(normalBase + "/")) {
    return normalFull.slice(normalBase.length + 1);
  }
  return normalFull;
}

/**
 * Cross-platform absolute-path detection.
 */
export function isAbsolutePath(p: string): boolean {
  if (!p) return false;
  if (p.startsWith("/")) return true;
  if (/^[A-Za-z]:[\\/]/.test(p)) return true;
  if (p.startsWith("\\\\") || p.startsWith("//")) return true;
  return false;
}

/**
 * Check if path is safe: under baseDir, no `..`, no absolute path.
 * Returns the safe joined path or throws.
 */
export function safeJoin(baseDir: string, userPath: string): string {
  const normalized = normalizePath(userPath);
  if (!normalized || normalized.trim().length === 0) {
    throw new Error("Path is empty");
  }
  if (isAbsolutePath(normalized)) {
    throw new Error(`Absolute path rejected: ${normalized}`);
  }
  const segments = normalized.split("/");
  if (segments.some((s) => s === ".." || s === ".")) {
    throw new Error(`Path traversal rejected: ${normalized}`);
  }
  if (/[\x00-\x1f]/.test(normalized)) {
    throw new Error(`Control characters in path: ${normalized}`);
  }
  const joined = joinPath(baseDir, normalized);
  // Verify the result is still under baseDir
  if (!joined.startsWith(normalizePath(baseDir))) {
    throw new Error(`Path escapes base directory: ${normalized}`);
  }
  return joined;
}

/**
 * Infer wiki page type from a file path relative to wiki root.
 */
export function inferTypeFromPath(relativePath: string): string {
  const normalized = normalizePath(relativePath).toLowerCase();
  if (normalized.includes("/entities/")) return "entity";
  if (normalized.includes("/concepts/")) return "concept";
  if (normalized.includes("/sources/")) return "source";
  if (normalized.endsWith("/overview.md")) return "overview";
  if (normalized.endsWith("/index.md")) return "index";
  return "concept";
}

/**
 * Get the subdirectory for a page type.
 */
export function typeToDir(type: string): string {
  const map: Record<string, string> = {
    entity: "entities",
    concept: "concepts",
    source: "sources",
    overview: "",
    index: "",
  };
  return map[type] ?? "concepts";
}
