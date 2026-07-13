import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { HttpError } from "../../../../lib/http.js";

// Wiki 系统文件：不应出现在页面列表、图谱、搜索结果中
export const SYSTEM_FILES = ["index.md", "log.md", "overview.md"];

export function isSystemFile(name: string): boolean {
  return SYSTEM_FILES.includes(name);
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
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

export function readFileSafe(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
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
  return readDirRecursive(dir, (_f, name) => {
    if (ext && !name.endsWith(ext)) return false;
    if (isSystemFile(name)) return false;
    return true;
  }).length;
}

export function collectFileEntries(
  dir: string,
): Array<{ name: string; path: string; is_dir: boolean }> {
  const results: Array<{ name: string; path: string; is_dir: boolean }> = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      results.push({ name: entry.name, path: fullPath, is_dir: entry.isDirectory() });
      if (entry.isDirectory()) {
        results.push(...collectFileEntries(fullPath));
      }
    }
  } catch {
    /* dir doesn't exist */
  }
  return results;
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function sha256(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export function slugify(text: string): string {
  const base = text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "")
    .replace(/^-|-$/g, "");
  if (base) return base;
  const hash = crypto.createHash("sha256").update(text).digest("hex").slice(0, 8);
  return `space-${hash}`;
}

export function dateSortDesc(a: string, b: string): number {
  const ta = a ? new Date(a).getTime() : 0;
  const tb = b ? new Date(b).getTime() : 0;
  return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
}
