import fs from "node:fs";
import path from "node:path";
import { runOkfLint, normalizePath } from "@feedmind/wiki-core";
import type { LintResult } from "@feedmind/contracts";
import { getSpaceDir, ensureRuntimeDir, readDirRecursive } from "./space-fs/index.js";

function lintPath(spaceId: string): string {
  return path.join(getSpaceDir(spaceId), ".feedmind", "lint.json");
}

export async function runLint(spaceId: string): Promise<LintResult[]> {
  const wikiDir = path.join(getSpaceDir(spaceId), "wiki");
  if (!fs.existsSync(wikiDir)) return [];

  const pages: Array<{ path: string; content: string }> = [];
  for (const fullPath of readDirRecursive(wikiDir, (_f, name) =>
    name.toLowerCase().endsWith(".md"),
  )) {
    try {
      const content = fs.readFileSync(fullPath, "utf-8");
      pages.push({ path: normalizePath(fullPath), content });
    } catch {
      /* 单个文件读取失败不中断遍历，由 lint 结果统一报告 */
    }
  }

  const results = runOkfLint(pages, normalizePath(wikiDir));

  // 缓存检查结果
  ensureRuntimeDir(spaceId);
  fs.writeFileSync(lintPath(spaceId), JSON.stringify(results, null, 2), "utf-8");

  return results;
}

export async function getLintItems(spaceId: string): Promise<LintResult[]> {
  try {
    return JSON.parse(fs.readFileSync(lintPath(spaceId), "utf-8"));
  } catch {
    return [];
  }
}
