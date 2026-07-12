import fs from "node:fs";
import path from "node:path";
import { runStructuralLint, getFileStem, normalizePath } from "@feedmind/wiki-core";
import type { LintResult } from "@feedmind/contracts";
import { getSpaceDir, ensureLlmWikiDir } from "./space-fs/index.js";

function lintPath(spaceId: string): string {
  return path.join(getSpaceDir(spaceId), ".llm-wiki", "lint.json");
}

export async function runLint(spaceId: string): Promise<LintResult[]> {
  const wikiDir = path.join(getSpaceDir(spaceId), "wiki");
  if (!fs.existsSync(wikiDir)) return [];

  const pages: Array<{ path: string; slug: string; content: string }> = [];

  const loadDir = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        loadDir(fullPath);
      } else if (entry.name.endsWith(".md")) {
        try {
          const content = fs.readFileSync(fullPath, "utf-8");
          pages.push({
            path: normalizePath(fullPath),
            slug: getFileStem(entry.name),
            content,
          });
        } catch {
          /* skip */
        }
      }
    }
  };
  try {
    loadDir(wikiDir);
  } catch {
    /* skip */
  }

  const results = runStructuralLint(pages, normalizePath(wikiDir));

  // Cache results
  ensureLlmWikiDir(spaceId);
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
