import { parseFrontmatter, formatFrontmatter, extractSources, extractRelated } from "./frontmatter.js";
import { extractWikilinks } from "./wikilinks.js";

/**
 * Merge two sets of frontmatter array fields (sources, tags, related).
 * Union-based, preserves first-encountered casing.
 */
export function mergeArrays(existing: string[], incoming: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  const add = (items: string[]) => {
    for (const item of items) {
      const key = item.toLowerCase().trim();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(item.trim());
      }
    }
  };

  add(existing);
  add(incoming);

  return result;
}

/**
 * Merge two wiki page contents.
 * Returns the merged content string.
 */
export function mergePageContent(
  existing: string | null,
  incoming: string,
  sourceFileName: string,
): string {
  if (!existing) return incoming;

  const { frontmatter: existingFm, body: existingBody } = parseFrontmatter(existing);
  const { frontmatter: incomingFm, body: incomingBody } = parseFrontmatter(incoming);

  // Locked fields: preserve existing type/title/created
  const type = (existingFm.type as string) ?? (incomingFm.type as string) ?? "concept";
  const title = (existingFm.title as string) ?? (incomingFm.title as string) ?? "";
  const created = (existingFm.created as string) ?? (incomingFm.created as string) ?? nowDate();

  // Merge array fields
  const tags = mergeArrays(
    (existingFm.tags as string[]) ?? [],
    (incomingFm.tags as string[]) ?? [],
  );
  const sources = mergeArrays(
    (existingFm.sources as string[]) ?? [],
    (incomingFm.sources as string[]) ?? [],
  );
  // Ensure this source is in the list
  if (sourceFileName && !sources.some((s) => s.toLowerCase() === sourceFileName.toLowerCase())) {
    sources.push(sourceFileName);
  }

  const related = mergeArrays(
    (existingFm.related as string[]) ?? [],
    (incomingFm.related as string[]) ?? [],
  );

  // Prefer longer body (likely more content)
  const body = existingBody.trim().length >= incomingBody.trim().length
    ? existingBody.trim()
    : incomingBody.trim();

  const fm: Record<string, unknown> = {
    type,
    title,
    tags,
    sources,
    related,
    created,
    updated: nowDate(),
  };

  return formatFrontmatter(fm) + "\n" + body;
}

function nowDate(): string {
  return new Date().toISOString().slice(0, 10);
}
