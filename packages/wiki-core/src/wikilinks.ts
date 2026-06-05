const WIKILINK_REGEX = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g;

/**
 * Extract wikilink targets from content, skipping fenced code blocks.
 */
export function extractWikilinks(content: string): string[] {
  const links: string[] = [];
  // Remove fenced code blocks first
  const clean = content.replace(/```[\s\S]*?```/g, "").replace(/~~~[\s\S]*?~~~/g, "");
  const regex = new RegExp(WIKILINK_REGEX.source, "g");
  let match: RegExpExecArray | null;
  while ((match = regex.exec(clean)) !== null) {
    links.push(match[1].trim());
  }
  return links;
}

/**
 * Extract wikilinks with display text.
 */
export function extractWikilinksWithAlias(
  content: string,
): Array<{ target: string; alias: string | null }> {
  const links: Array<{ target: string; alias: string | null }> = [];
  const clean = content.replace(/```[\s\S]*?```/g, "").replace(/~~~[\s\S]*?~~~/g, "");
  const regex = new RegExp(WIKILINK_REGEX.source, "g");
  let match: RegExpExecArray | null;
  while ((match = regex.exec(clean)) !== null) {
    links.push({ target: match[1].trim(), alias: match[2]?.trim() ?? null });
  }
  return links;
}

/**
 * Normalize a wikilink target for matching (lowercase, hyphens).
 */
export function normalizeWikilinkTarget(target: string): string {
  return target.toLowerCase().replace(/\s+/g, "-");
}

/**
 * Resolve a wikilink target to a known page slug.
 * Returns the matching slug or null if not found.
 */
export function resolveWikilink(
  target: string,
  knownSlugs: Set<string>,
): string | null {
  if (knownSlugs.has(target)) return target;

  const normalized = normalizeWikilinkTarget(target);
  for (const slug of knownSlugs) {
    if (slug.toLowerCase() === normalized) return slug;
    if (normalizeWikilinkTarget(slug) === normalized) return slug;
  }
  return null;
}

/**
 * Strip wikilinks to deleted pages, replacing with plain text.
 */
export function stripDeletedWikilinks(
  text: string,
  deletedKeys: Set<string>,
): string {
  if (deletedKeys.size === 0) return text;
  return text.replace(WIKILINK_REGEX, (match, target: string, display?: string) => {
    const key = normalizeWikilinkTarget(target.trim());
    if (!deletedKeys.has(key)) return match;
    return display ?? target;
  });
}

/**
 * Normalize a label for comparison (lowercase, strip hyphens/spaces).
 */
export function normalizeWikiRefKey(s: string): string {
  const normalized = s.trim().replace(/\\/g, "/");
  const leaf = normalized.split("/").pop() ?? normalized;
  const withoutMd = leaf.toLowerCase().endsWith(".md") ? leaf.slice(0, -3) : leaf;
  return withoutMd.toLowerCase().replace(/[\s\-_]+/g, "");
}

/**
 * Build the lookup set of normalized keys for deleted pages.
 */
export function buildDeletedKeys(infos: Array<{ slug: string; title: string }>): Set<string> {
  const keys = new Set<string>();
  for (const info of infos) {
    if (info.slug) keys.add(normalizeWikiRefKey(info.slug));
    if (info.title) keys.add(normalizeWikiRefKey(info.title));
  }
  return keys;
}

/**
 * Clean index.md listing lines whose primary wikilink targets a deleted page.
 */
export function cleanIndexListing(text: string, deletedKeys: Set<string>): string {
  if (deletedKeys.size === 0) return text;
  const INDEX_ENTRY_RE = /^\s*[-*]\s*\[\[([^\]|]+?)(?:\|[^\]]+)?\]\]/;
  return text
    .split("\n")
    .filter((line) => {
      const m = line.match(INDEX_ENTRY_RE);
      if (!m) return true;
      return !deletedKeys.has(normalizeWikiRefKey(m[1].trim()));
    })
    .join("\n");
}
