import yaml from "js-yaml";

export interface FrontmatterParseResult {
  frontmatter: Record<string, unknown>;
  body: string;
  rawBlock: string;
}

const FM_BLOCK_RE = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/;

export function parseFrontmatter(content: string): FrontmatterParseResult {
  const match = content.match(FM_BLOCK_RE);
  if (!match) return { frontmatter: {}, body: content, rawBlock: "" };

  const yamlPayload = match[1];
  const rawBlock = match[0];
  const body = content.slice(rawBlock.length);

  let parsed: unknown;
  try {
    parsed = yaml.load(yamlPayload, { schema: yaml.JSON_SCHEMA });
  } catch {
    return { frontmatter: {}, body, rawBlock };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { frontmatter: {}, body, rawBlock };
  }

  const frontmatter: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    frontmatter[key] = value;
  }

  return { frontmatter, body, rawBlock };
}

export function formatFrontmatter(fm: Record<string, unknown>): string {
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fm)) {
    if (value === undefined || value === null) continue;
    filtered[key] = value;
  }
  return "---\n" + yaml.dump(filtered, { lineWidth: -1, noRefs: true, quotingType: '"', forceQuotes: false }) + "---";
}

export function buildPageContent(page: {
  type: string;
  title: string;
  tags: string[];
  sources: string[];
  related: string[];
  created: string;
  updated: string;
  content: string;
}): string {
  const fm: Record<string, unknown> = {
    type: page.type,
    title: page.title,
    tags: page.tags,
    sources: page.sources,
    related: page.related,
    created: page.created,
    updated: page.updated,
  };
  return formatFrontmatter(fm) + "\n" + page.content;
}

export function extractTitle(content: string): string {
  const { frontmatter } = parseFrontmatter(content);
  return (frontmatter.title as string) || "";
}

export function extractType(content: string): string {
  const { frontmatter } = parseFrontmatter(content);
  return ((frontmatter.type as string) || "concept").toLowerCase();
}

export function extractSources(content: string): string[] {
  const { frontmatter } = parseFrontmatter(content);
  const v = frontmatter.sources;
  return Array.isArray(v) ? v.map(String) : [];
}

export function extractTags(content: string): string[] {
  const { frontmatter } = parseFrontmatter(content);
  const v = frontmatter.tags;
  return Array.isArray(v) ? v.map(String) : [];
}

export function extractRelated(content: string): string[] {
  const { frontmatter } = parseFrontmatter(content);
  const v = frontmatter.related;
  return Array.isArray(v) ? v.map(String) : [];
}

export function writeSources(content: string, sources: string[]): string {
  return writeFrontmatterField(content, "sources", sources);
}

export function writeFrontmatterField(
  content: string,
  field: string,
  values: string[],
): string {
  const { frontmatter, body } = parseFrontmatter(content);
  frontmatter[field] = values;
  return formatFrontmatter(frontmatter) + "\n" + body;
}
