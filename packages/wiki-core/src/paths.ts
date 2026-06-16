/** 标准化路径为 Unix 风格（正斜杠），跨平台兼容 */
export function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}

/** 用正斜杠拼接路径段 */
export function joinPath(...segments: string[]): string {
  return segments
    .map((s) => s.replace(/\\/g, "/"))
    .join("/")
    .replace(/\/+/g, "/");
}

/** 从路径中提取文件名 */
export function getFileName(p: string): string {
  const normalized = p.replace(/\\/g, "/");
  return normalized.split("/").pop() ?? p;
}

/** 获取文件名主体（不含扩展名） */
export function getFileStem(p: string): string {
  const name = getFileName(p);
  const lastDot = name.lastIndexOf(".");
  return lastDot > 0 ? name.slice(0, lastDot) : name;
}

/** 获取相对于基路径的相对路径 */
export function getRelativePath(fullPath: string, basePath: string): string {
  const normalFull = normalizePath(fullPath);
  const normalBase = normalizePath(basePath).replace(/\/$/, "");
  if (normalFull.startsWith(normalBase + "/")) {
    return normalFull.slice(normalBase.length + 1);
  }
  return normalFull;
}

/** 跨平台绝对路径检测 */
export function isAbsolutePath(p: string): boolean {
  if (!p) return false;
  if (p.startsWith("/")) return true;
  if (/^[A-Za-z]:[\\/]/.test(p)) return true;
  if (p.startsWith("\\\\") || p.startsWith("//")) return true;
  return false;
}

/**
 * 安全拼接路径：确保在 baseDir 下，拒绝 .. 和绝对路径。
 * 返回安全拼接后的路径，失败则抛异常。
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
  // 验证拼接结果仍在 baseDir 之下
  if (!joined.startsWith(normalizePath(baseDir))) {
    throw new Error(`Path escapes base directory: ${normalized}`);
  }
  return joined;
}

/** 从 wiki 根相对路径推断页面类型 */
export function inferTypeFromPath(relativePath: string): string {
  const normalized = normalizePath(relativePath).toLowerCase();
  if (normalized.includes("/entities/")) return "entity";
  if (normalized.includes("/concepts/")) return "concept";
  if (normalized.includes("/sources/")) return "source";
  if (normalized.endsWith("/overview.md")) return "overview";
  if (normalized.endsWith("/index.md")) return "index";
  return "concept";
}

/** 根据页面类型获取对应子目录名 */
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
