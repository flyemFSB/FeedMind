import type { LintResult } from "@feedmind/contracts";
import { extractWikilinks, normalizeWikilinkTarget } from "./wikilinks.js";
import { parseFrontmatter, extractType, extractTitle } from "./frontmatter.js";
import { getFileStem, getRelativePath } from "./paths.js";

/**
 * Run structural lint on wiki pages.
 */
export function runStructuralLint(
  pages: Array<{ path: string; slug: string; content: string }>,
  wikiRoot: string,
): LintResult[] {
  // Build slug map
  const slugMap = new Map<string, string>();
  for (const p of pages) {
    slugMap.set(p.slug.toLowerCase(), p.path);
    slugMap.set(getFileStem(p.path).toLowerCase(), p.path);
  }

  // Build inbound link counts
  const inboundCounts = new Map<string, number>();
  const outlinksByPage = new Map<string, string[]>();

  for (const p of pages) {
    const links = extractWikilinks(p.content);
    outlinksByPage.set(p.slug, links);

    for (const link of links) {
      const lookup = link.toLowerCase();
      if (slugMap.has(lookup)) {
        const targetSlug = getFileStem(slugMap.get(lookup)!).toLowerCase();
        inboundCounts.set(targetSlug, (inboundCounts.get(targetSlug) ?? 0) + 1);
      }
    }
  }

  const results: LintResult[] = [];

  for (const p of pages) {
    const shortName = getRelativePath(p.path, wikiRoot);

    // Orphan check
    const inbound = inboundCounts.get(p.slug.toLowerCase()) ?? 0;
    if (inbound === 0 && p.slug !== "index" && p.slug !== "log") {
      results.push({
        type: "orphan",
        severity: "info",
        page: shortName,
        detail: "No other pages link to this page.",
      });
    }

    // No outlinks check
    const outlinks = outlinksByPage.get(p.slug) ?? [];
    if (outlinks.length === 0 && p.slug !== "index" && p.slug !== "log" && p.slug !== "overview") {
      results.push({
        type: "no-outlinks",
        severity: "info",
        page: shortName,
        detail: "This page has no [[wikilink]] references to other pages.",
      });
    }

    // Broken links
    for (const link of outlinks) {
      const lookup = link.toLowerCase();
      const exists = slugMap.has(lookup);
      if (!exists) {
        results.push({
          type: "broken-link",
          severity: "warning",
          page: shortName,
          detail: `Broken link: [[${link}]] — target page not found.`,
        });
      }
    }

    // Invalid frontmatter check (type must be set)
    const type = extractType(p.content);
    if (!type) {
      results.push({
        type: "semantic",
        severity: "warning",
        page: shortName,
        detail: "Missing or invalid 'type' in frontmatter.",
      });
    }
  }

  return results;
}
