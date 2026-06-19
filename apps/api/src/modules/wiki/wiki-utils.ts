import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizePath, safeJoin, parseFrontmatter } from "@feedmind/wiki-core";
import { apiEnv } from "../../env.js";
import { HttpError } from "../../lib/http.js";

export { normalizePath, safeJoin };

// 以当前文件位置推算项目根目录，不依赖 process.cwd()
const _thisDir = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(_thisDir, "..", "..", "..", "..", "..");

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function sha256(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export function slugify(text: string): string {
  // 先移除非 ASCII 字符（含中文），生成基础 slug
  const base = text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "")
    .replace(/^-|-$/g, "");

  // 纯 ASCII 名称直接返回，否则附加短哈希保证唯一
  if (base) return base;
  const hash = crypto.createHash("sha256").update(text).digest("hex").slice(0, 8);
  return `space-${hash}`;
}

export function safeWriteFile(filePath: string, content: string): void {
  try {
    fs.writeFileSync(filePath, content, "utf-8");
  } catch (err: unknown) {
    throw new HttpError(
      500,
      "INTERNAL_ERROR",
      `File write failed: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
}

export function safeUnlink(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch (err: unknown) {
    throw new HttpError(
      500,
      "INTERNAL_ERROR",
      `File delete failed: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
}

export function safeRename(oldPath: string, newPath: string): void {
  try {
    fs.renameSync(oldPath, newPath);
  } catch (err: unknown) {
    throw new HttpError(
      500,
      "INTERNAL_ERROR",
      `File rename failed: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
}

export function readDirRecursive(
  dir: string,
  predicate?: (filePath: string, relPath: string) => boolean,
): string[] {
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...readDirRecursive(fullPath, predicate));
      } else if (!predicate || predicate(fullPath, entry.name)) {
        results.push(fullPath);
      }
    }
  } catch {
    /* dir doesn't exist */
  }
  return results;
}

export function countFiles(dir: string, ext?: string): number {
  return readDirRecursive(dir, (_f, name) => (ext ? name.endsWith(ext) : true)).length;
}

export function dateSortDesc(a: string, b: string): number {
  const ta = a ? new Date(a).getTime() : 0;
  const tb = b ? new Date(b).getTime() : 0;
  return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
}

export function wikiRootDir(): string {
  return apiEnv.WIKI_DIR
    ? path.resolve(PROJECT_ROOT, apiEnv.WIKI_DIR)
    : path.join(PROJECT_ROOT, "data", "wiki");
}

export function ensureLlmWikiDir(spaceId: string): void {
  const dir = path.join(spaceDir(spaceId), ".llm-wiki");
  fs.mkdirSync(dir, { recursive: true });
}

/** 通用字符：Unicode 字母、数字、下划线、连字符，禁止路径分隔与遍历 */
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

export function spaceDir(spaceId: string): string {
  validateSpaceId(spaceId);
  return path.join(wikiRootDir(), spaceId);
}

/** 从 sources/<sourcePath> 文件中提取 frontmatter title 用于展示 */
export function readSourceTitle(spaceId: string, sourcePath: string): string {
  const sourceDir = path.join(spaceDir(spaceId), "raw", "sources");
  const sourceFilePath = safeJoin(sourceDir, sourcePath);
  try {
    const raw = fs.readFileSync(sourceFilePath, "utf-8");
    const { frontmatter } = parseFrontmatter(raw);
    return (frontmatter.title as string) || "";
  } catch {
    return "";
  }
}
