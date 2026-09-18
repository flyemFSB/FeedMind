import type { OkfSourceEntry } from "./frontmatter.js";

export type RetractAction =
  | { kind: "skip" }
  | { kind: "delete" }
  | { kind: "update"; sources: OkfSourceEntry[] };

/** index.md / log.md 由管线自维护，重导入撤回时不碰。 */
export function isSystemWikiPath(relPath: string): boolean {
  const base = relPath.replace(/\\/g, "/").split("/").at(-1)?.toLowerCase() ?? "";
  return base === "index.md" || base === "log.md";
}

/**
 * 撤回 sourceIdentity 对该页的贡献。
 * 精确匹配 resource：identity 就是 ingest 时写入的 sourceIdentity。
 */
export function computeRetractAction(
  sources: OkfSourceEntry[],
  sourceIdentity: string,
): RetractAction {
  const remaining = sources.filter((s) => s.resource !== sourceIdentity);
  if (remaining.length === sources.length) return { kind: "skip" };
  if (remaining.length === 0) return { kind: "delete" };
  return { kind: "update", sources: remaining };
}
