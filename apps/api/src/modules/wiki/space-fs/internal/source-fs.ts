import fs from "node:fs";
import path from "node:path";
import {
  extractSourceReferences,
  extractString,
  parseFrontmatter,
  safeJoin,
} from "@feedmind/wiki-core";
import { isSystemFile, readDirRecursive, readFileSafe, sha256 } from "./io.js";
import { getSpaceDir, getRawSourcesDir, getWikiDir } from "./paths.js";

export function walkSources(spaceId: string): string[] {
  const sourcesDir = getRawSourcesDir(spaceId);
  const files = readDirRecursive(sourcesDir);
  const withMtime: Array<{ path: string; mtime: number }> = [];
  for (const f of files) {
    try {
      withMtime.push({ path: f, mtime: fs.statSync(f).mtimeMs });
    } catch {
      /* file deleted between readdir and stat */
    }
  }
  withMtime.sort((a, b) => b.mtime - a.mtime);
  return withMtime.map((e) => e.path);
}

export function sourcePageCounts(spaceId: string): Map<string, number> {
  const counts = new Map<string, number>();
  const wikiDir = getWikiDir(spaceId);
  const wikiFiles = readDirRecursive(
    wikiDir,
    (_f, name) => name.toLowerCase().endsWith(".md") && !isSystemFile(name),
  );
  for (const wf of wikiFiles) {
    try {
      const content = fs.readFileSync(wf, "utf-8");
      const { frontmatter } = parseFrontmatter(content);
      const srcs = extractSourceReferences(frontmatter);
      for (const s of srcs) {
        counts.set(s, (counts.get(s) ?? 0) + 1);
      }
    } catch {
      /* skip unreadable */
    }
  }
  return counts;
}

export function findSourceBySlug(spaceId: string, sourceId: string): string | null {
  const sourcesDir = getRawSourcesDir(spaceId);
  const files = readDirRecursive(sourcesDir);
  for (const filePath of files) {
    if (path.basename(filePath, path.extname(filePath)) === sourceId) return filePath;
  }
  return null;
}

export function readSource(filePath: string, spaceId: string): Record<string, unknown> | null {
  try {
    const stat = fs.statSync(filePath);
    const content = fs.readFileSync(filePath, "utf-8");
    const { frontmatter, body } = parseFrontmatter(content);
    const fileName = path.basename(filePath);
    const slug = path.basename(filePath, path.extname(filePath));
    return {
      id: slug,
      space_id: spaceId,
      identity: fileName,
      title: extractString(frontmatter, "title") ?? slug,
      kind: extractString(frontmatter, "kind") ?? "text",
      original_name: fileName,
      original_uri: (frontmatter.original_uri as string) ?? null,
      storage_path: path.relative(getSpaceDir(spaceId), filePath).replace(/\\/g, "/"),
      mime_type: "text/plain",
      size_bytes: stat.size,
      content_hash: sha256(body.trim()),
      status: "ready",
      metadata: (frontmatter.metadata as Record<string, unknown>) ?? {},
      created_at: extractString(frontmatter, "timestamp") ?? stat.birthtime.toISOString(),
      updated_at: extractString(frontmatter, "timestamp") ?? stat.mtime.toISOString(),
    };
  } catch {
    return null;
  }
}

export function readSourceListItem(
  filePath: string,
  spaceId: string,
  pageCounts: Map<string, number>,
): Record<string, unknown> | null {
  const base = readSource(filePath, spaceId);
  if (!base) return null;
  const pageCount =
    pageCounts.get(base.id as string) ?? pageCounts.get(base.identity as string) ?? 0;
  return {
    id: base.id,
    space_id: base.space_id,
    identity: base.identity,
    title: base.title,
    kind: base.kind,
    original_name: base.original_name,
    mime_type: base.mime_type,
    status: base.status,
    page_count: pageCount,
    created_at: base.created_at,
    updated_at: base.updated_at,
  };
}

export function readSourceTitle(spaceId: string, sourcePath: string): string {
  const sourceDir = getRawSourcesDir(spaceId);
  const sourceFilePath = safeJoin(sourceDir, sourcePath);
  const raw = readFileSafe(sourceFilePath);
  if (!raw) return "";
  try {
    const { frontmatter } = parseFrontmatter(raw);
    return extractString(frontmatter, "title") ?? "";
  } catch {
    return "";
  }
}
