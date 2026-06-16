import {
  normalizeWikiRefKey,
  buildDeletedKeys,
  cleanIndexListing,
  stripDeletedWikilinks,
} from "./wikilinks.js";
import { parseFrontmatter, formatFrontmatter, extractRelated } from "./frontmatter.js";

export { buildDeletedKeys, cleanIndexListing, stripDeletedWikilinks };

/**
 * 清理 frontmatter `related` 字段，移除指向已删除页面的引用。
 */
export function cleanRelatedField(content: string, deletedKeys: Set<string>): string | null {
  const related = extractRelated(content);
  if (related.length === 0) return null;

  const filtered = related.filter((s) => !deletedKeys.has(normalizeWikiRefKey(s)));
  if (filtered.length === related.length) return null;

  const { frontmatter, body } = parseFrontmatter(content);
  frontmatter.related = filtered;
  return formatFrontmatter(frontmatter) + "\n" + body;
}

/**
 * 清理 Wiki 页面中所有指向已删除页面的引用。
 * 返回更新后的内容，若无变更则返回 null。
 */
export function cleanPageReferences(content: string, deletedKeys: Set<string>): string | null {
  let updated = content;

  // Clean index listing
  const indexCleaned = cleanIndexListing(updated, deletedKeys);
  if (indexCleaned !== updated) updated = indexCleaned;

  // Strip wikilinks to deleted pages
  const wikilinkCleaned = stripDeletedWikilinks(updated, deletedKeys);
  if (wikilinkCleaned !== updated) updated = wikilinkCleaned;

  // Clean related field
  const relatedCleaned = cleanRelatedField(updated, deletedKeys);
  if (relatedCleaned !== null) updated = relatedCleaned;

  return updated !== content ? updated : null;
}
