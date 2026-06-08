import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizePath, safeJoin, parseFrontmatter } from "@feedmind/wiki-core";

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

export function nowDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function sha256(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s一-鿿-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    || "untitled";
}

export function safeWriteFile(filePath: string, content: string): void {
  try {
    fs.writeFileSync(filePath, content, "utf-8");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw Object.assign(new Error(`File write failed: ${msg}`), { statusCode: 500 });
  }
}

export function safeUnlink(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw Object.assign(new Error(`File delete failed: ${msg}`), { statusCode: 500 });
  }
}

export function safeRename(oldPath: string, newPath: string): void {
  try {
    fs.renameSync(oldPath, newPath);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw Object.assign(new Error(`File rename failed: ${msg}`), { statusCode: 500 });
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
  } catch { /* dir doesn't exist */ }
  return results;
}

export function countFiles(dir: string, ext?: string): number {
  return readDirRecursive(dir, (_f, name) =>
    ext ? name.endsWith(ext) : true,
  ).length;
}

export function dateSortDesc(a: string, b: string): number {
  const ta = a ? new Date(a).getTime() : 0;
  const tb = b ? new Date(b).getTime() : 0;
  return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
}

export function wikiRootDir(): string {
  return process.env.WIKI_DIR
    ? path.resolve(PROJECT_ROOT, process.env.WIKI_DIR)
    : path.join(PROJECT_ROOT, "data", "wiki");
}

export function spaceDir(spaceId: string): string {
  return path.join(wikiRootDir(), spaceId);
}

/** 从 sources/<sourcePath> 文件中提取 frontmatter title 用于展示 */
export function readSourceTitle(spaceId: string, sourcePath: string): string {
  const sourceFilePath = path.join(spaceDir(spaceId), "raw", "sources", sourcePath);
  try {
    const raw = fs.readFileSync(sourceFilePath, "utf-8");
    const { frontmatter } = parseFrontmatter(raw);
    return (frontmatter.title as string) || "";
  } catch {
    return "";
  }
}
