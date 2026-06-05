import { normalizePath, getFileName, getFileStem, joinPath } from "./paths.js";
import { sourceIdentityForPath, sourceReferenceIdentity, sourceSummarySlugFromIdentity } from "./source-identity.js";
import { parseFrontmatter, formatFrontmatter, extractSources, extractRelated } from "./frontmatter.js";

/**
 * Result of deleting source files.
 */
export interface DeleteSourcesResult {
  deletedWikiPaths: string[];
  rewrittenSourcePages: number;
}

/**
 * Delete source files and cascade cleanup of wiki pages that reference them.
 */
export function deleteSources(
  projectDir: string,
  sourcePaths: string[],
  pageContents: Map<string, { path: string; content: string }>,
  mode: "detach" | "delete-orphans" = "detach",
): DeleteSourcesResult {
  const pp = normalizePath(projectDir);

  // Build identity set for sources being deleted
  const deletingIdentities = new Set(
    sourcePaths.map((sp) => {
      const fullPath = joinPath(pp, "raw/sources", sp);
      return sourceReferenceIdentity(sourceIdentityForPath(pp, fullPath));
    }),
  );

  const pagesToDelete: string[] = [];
  const pagesToRewrite: Array<{ path: string; newContent: string }> = [];

  for (const [pageId, page] of pageContents) {
    const sources = extractSources(page.content);
    if (sources.length === 0) continue;

    const survivors = sources.filter((s: string) => {
      const key = sourceReferenceIdentity(s);
      return !deletingIdentities.has(key);
    });

    if (survivors.length === sources.length) continue;

    if (survivors.length === 0) {
      pagesToDelete.push(page.path);
    } else if (mode === "detach") {
      // Remove deleted source from sources list, keep page
      const { frontmatter, body } = parseFrontmatter(page.content);
      frontmatter.sources = survivors;
      pagesToRewrite.push({ path: page.path, newContent: formatFrontmatter(frontmatter) + "\n" + body });
    }
  }

  return {
    deletedWikiPaths: pagesToDelete,
    rewrittenSourcePages: pagesToRewrite.length,
  };
}

/**
 * Get a preview of what would be deleted/affected.
 */
export function previewDeleteImpact(
  projectDir: string,
  sourcePaths: string[],
  pageContents: Map<string, { path: string; content: string }>,
): {
  willDelete: string[];
  willUpdate: string[];
  unaffected: number;
} {
  const pp = normalizePath(projectDir);
  const deletingIdentities = new Set(
    sourcePaths.map((sp) => {
      const fullPath = joinPath(pp, "raw/sources", sp);
      return sourceReferenceIdentity(sourceIdentityForPath(pp, fullPath));
    }),
  );

  const willDelete: string[] = [];
  const willUpdate: string[] = [];
  let unaffected = 0;

  for (const [, page] of pageContents) {
    const sources = extractSources(page.content);
    if (sources.length === 0) { unaffected++; continue; }

    const survivors = sources.filter((s: string) => {
      const key = sourceReferenceIdentity(s);
      return !deletingIdentities.has(key);
    });

    if (survivors.length === sources.length) { unaffected++; continue; }
    if (survivors.length === 0) { willDelete.push(page.path); continue; }
    willUpdate.push(page.path);
  }

  return { willDelete, willUpdate, unaffected };
}
