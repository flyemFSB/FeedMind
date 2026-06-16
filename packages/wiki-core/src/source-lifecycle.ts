import { normalizePath, joinPath } from "./paths.js";
import { sourceIdentityForPath, sourceReferenceIdentity } from "./source-identity.js";
import { parseFrontmatter, formatFrontmatter, extractSources } from "./frontmatter.js";

/** 删除来源文件的结果 */
export interface DeleteSourcesResult {
  deletedWikiPaths: string[];
  rewrittenSourcePages: number;
}

/**
 * 删除来源文件，并级联清理引用了这些来源的 Wiki 页面。
 */
export function deleteSources(
  projectDir: string,
  sourcePaths: string[],
  pageContents: Map<string, { path: string; content: string }>,
  mode: "detach" | "delete-orphans" = "detach",
): DeleteSourcesResult {
  const pp = normalizePath(projectDir);

  // 构建被删除来源的身份标识集
  const deletingIdentities = new Set(
    sourcePaths.map((sp) => {
      const fullPath = joinPath(pp, "raw/sources", sp);
      return sourceReferenceIdentity(sourceIdentityForPath(pp, fullPath));
    }),
  );

  const pagesToDelete: string[] = [];
  const pagesToRewrite: Array<{ path: string; newContent: string }> = [];

  for (const [, page] of pageContents) {
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
      // 从 sources 列表中移除已删除来源，保留页面
      const { frontmatter, body } = parseFrontmatter(page.content);
      frontmatter.sources = survivors;
      pagesToRewrite.push({
        path: page.path,
        newContent: formatFrontmatter(frontmatter) + "\n" + body,
      });
    }
  }

  return {
    deletedWikiPaths: pagesToDelete,
    rewrittenSourcePages: pagesToRewrite.length,
  };
}

/**
 * 预览删除操作的影响范围。
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
    if (sources.length === 0) {
      unaffected++;
      continue;
    }

    const survivors = sources.filter((s: string) => {
      const key = sourceReferenceIdentity(s);
      return !deletingIdentities.has(key);
    });

    if (survivors.length === sources.length) {
      unaffected++;
      continue;
    }
    if (survivors.length === 0) {
      willDelete.push(page.path);
      continue;
    }
    willUpdate.push(page.path);
  }

  return { willDelete, willUpdate, unaffected };
}
