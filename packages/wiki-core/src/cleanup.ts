import { extractWikilinks, normalizeWikiRefKey, buildDeletedKeys, cleanIndexListing, stripDeletedWikilinks, extractWikilinksWithAlias } from "./wikilinks.js";
import { parseFrontmatter, formatFrontmatter, extractRelated } from "./frontmatter.js";

export { buildDeletedKeys, cleanIndexListing, stripDeletedWikilinks };

/**
 * Clean frontmatter `related` field, removing references to deleted pages.
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
 * Clean all references to deleted pages from a wiki page.
 * Returns the updated content, or null if no changes.
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
