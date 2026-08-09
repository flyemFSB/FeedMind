/** 标准化路径为 Unix 风格（正斜杠），跨平台兼容 */
export function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}

export function joinPath(...segments: string[]): string {
  return segments
    .map((s) => s.replace(/\\/g, "/"))
    .join("/")
    .replace(/\/+/g, "/");
}

export function getFileName(p: string): string {
  const normalized = p.replace(/\\/g, "/");
  return normalized.split("/").pop() ?? p;
}

export function getFileStem(p: string): string {
  const name = getFileName(p);
  const lastDot = name.lastIndexOf(".");
  return lastDot > 0 ? name.slice(0, lastDot) : name;
}

export function getRelativePath(fullPath: string, basePath: string): string {
  const normalFull = normalizePath(fullPath);
  const normalBase = normalizePath(basePath).replace(/\/$/, "");
  if (normalFull.startsWith(normalBase + "/")) {
    return normalFull.slice(normalBase.length + 1);
  }
  return normalFull;
}

export function isAbsolutePath(p: string): boolean {
  if (!p) return false;
  if (p.startsWith("/")) return true;
  if (/^[A-Za-z]:/.test(p)) return true;
  if (p.startsWith("\\\\") || p.startsWith("//")) return true;
  return false;
}

/** 安全拼接路径：确保在 baseDir 下，拒绝 .. 和绝对路径 */
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
  if ([...normalized].some((c) => c < " ")) {
    throw new Error(`Control characters in path: ${normalized}`);
  }
  const joined = joinPath(baseDir, normalized);
  // 验证拼接结果仍在 baseDir 之下（精确匹配或子目录）
  const normalBase = normalizePath(baseDir);
  if (joined !== normalBase && !joined.startsWith(normalBase + "/")) {
    throw new Error(`Path escapes base directory: ${normalized}`);
  }
  return joined;
}

/** 校验并规范 OKF bundle 内的 Concept 文件路径。 */
export function normalizeConceptPath(p: string): string {
  const normalized = normalizePath(p);
  if (
    !normalized ||
    isAbsolutePath(normalized) ||
    normalized.includes("\0") ||
    [...normalized].some((c) => c < " ")
  ) {
    throw new Error("Invalid OKF concept path");
  }
  // Windows 文件系统禁止的字符，避免写入时 EINVAL
  if (/[<>:"|?*]/.test(normalized)) {
    throw new Error("Path contains illegal characters for Windows filesystem");
  }

  const parts = normalized.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) {
    throw new Error("Path traversal rejected");
  }
  if (!normalized.toLowerCase().endsWith(".md")) {
    throw new Error("OKF concept path must end with .md");
  }
  const fileName = parts.at(-1)?.toLowerCase();
  if (fileName === "index.md" || fileName === "log.md") {
    throw new Error("Reserved OKF filename cannot be a concept");
  }
  return normalized;
}
