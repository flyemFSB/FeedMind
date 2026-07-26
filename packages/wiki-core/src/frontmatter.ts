import yaml from "js-yaml";

export interface FrontmatterParseResult {
  frontmatter: Record<string, unknown>;
  body: string;
  rawBlock: string;
  hasFrontmatter: boolean;
  valid: boolean;
  error?: string;
}

const FM_BLOCK_RE = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/;

export function parseFrontmatter(content: string): FrontmatterParseResult {
  const match = content.match(FM_BLOCK_RE);
  if (!match) {
    return {
      frontmatter: {},
      body: content,
      rawBlock: "",
      hasFrontmatter: false,
      valid: true,
    };
  }

  const yamlPayload = match[1];
  const rawBlock = match[0];
  const body = content.slice(rawBlock.length);

  try {
    const parsed = yaml.load(yamlPayload, { schema: yaml.JSON_SCHEMA });
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        frontmatter: {},
        body,
        rawBlock,
        hasFrontmatter: true,
        valid: false,
        error: "Frontmatter must be a YAML mapping",
      };
    }

    return {
      frontmatter: parsed as Record<string, unknown>,
      body,
      rawBlock,
      hasFrontmatter: true,
      valid: true,
    };
  } catch (err) {
    return {
      frontmatter: {},
      body,
      rawBlock,
      hasFrontmatter: true,
      valid: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function formatFrontmatter(frontmatter: Record<string, unknown>): string {
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(frontmatter)) {
    if (value !== undefined && value !== null) filtered[key] = value;
  }

  return (
    "---\n" +
    yaml.dump(filtered, {
      lineWidth: -1,
      noRefs: true,
      quotingType: '"',
      forceQuotes: false,
    }) +
    "---"
  );
}

export interface ConceptDocumentInput {
  type: string;
  title?: string;
  description?: string;
  resource?: string;
  tags?: string[];
  timestamp?: string;
  frontmatter?: Record<string, unknown>;
  content: string;
}

/** 构建 OKF Concept 文档，扩展字段原样保留在 frontmatter 中。 */
export function buildConceptContent(document: ConceptDocumentInput): string {
  const frontmatter: Record<string, unknown> = {
    ...(document.frontmatter ?? {}),
    type: document.type,
  };

  if (document.title !== undefined) frontmatter.title = document.title;
  if (document.description !== undefined) frontmatter.description = document.description;
  if (document.resource !== undefined) frontmatter.resource = document.resource;
  if (document.tags !== undefined) frontmatter.tags = document.tags;
  if (document.timestamp !== undefined) frontmatter.timestamp = document.timestamp;

  return formatFrontmatter(frontmatter) + "\n" + document.content;
}

export function extractString(
  frontmatter: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = frontmatter[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function extractStringArray(frontmatter: Record<string, unknown>, key: string): string[] {
  const value = frontmatter[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function extractSourceReferences(frontmatter: Record<string, unknown>): string[] {
  return [
    ...new Set([
      ...extractStringArray(frontmatter, "provenance"),
      ...extractStringArray(frontmatter, "sources"),
    ]),
  ];
}

export function extractType(content: string): string | undefined {
  return extractString(parseFrontmatter(content).frontmatter, "type");
}

function mergeStringArrays(existing: unknown, incoming: unknown): string[] | undefined {
  const values = [
    ...(Array.isArray(existing) ? existing : []),
    ...(Array.isArray(incoming) ? incoming : []),
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  if (values.length === 0) return undefined;
  // 精确匹配去重，避免大小写敏感导致误删
  return [...new Set(values)];
}

/** 合并两个 OKF 文档，同时保留双方的未知扩展字段。 */
export function mergeConceptContent(existing: string, incoming: string): string {
  const oldDocument = parseFrontmatter(existing);
  const newDocument = parseFrontmatter(incoming);
  const frontmatter = { ...oldDocument.frontmatter, ...newDocument.frontmatter };
  for (const key of ["type", "title", "created"]) {
    if (oldDocument.frontmatter[key] !== undefined) frontmatter[key] = oldDocument.frontmatter[key];
  }
  const tags = mergeStringArrays(oldDocument.frontmatter.tags, newDocument.frontmatter.tags);
  const provenance = mergeStringArrays(
    extractSourceReferences(oldDocument.frontmatter),
    extractSourceReferences(newDocument.frontmatter),
  );
  const related = mergeStringArrays(
    oldDocument.frontmatter.related,
    newDocument.frontmatter.related,
  );
  if (tags) frontmatter.tags = tags;
  if (provenance) frontmatter.provenance = provenance;
  if (related) frontmatter.related = related;
  delete frontmatter.sources;

  const oldBody = oldDocument.body.trim();
  const newBody = newDocument.body.trim();
  const body = !oldBody
    ? newBody
    : !newBody || oldBody === newBody || oldBody.includes(newBody)
      ? oldBody
      : newBody.includes(oldBody)
        ? newBody
        : `${oldBody}\n\n---\n\n${newBody}`;
  return formatFrontmatter(frontmatter) + "\n" + body;
}
