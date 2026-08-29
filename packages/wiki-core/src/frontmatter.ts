// js-yaml 5 无 default export（官方设计决定），改具名导入；v5 自带 TS 类型，@types/js-yaml 已移除
import { dump, load, JSON_SCHEMA } from "js-yaml";

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

  const yamlPayload = match[1] ?? "";
  const rawBlock = match[0];
  const body = content.slice(rawBlock.length);

  try {
    const parsed = load(yamlPayload, { schema: JSON_SCHEMA });
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
    // v4 的 quotingType（字符）在 v5 更名为 quoteStyle（枚举）
    dump(filtered, {
      lineWidth: -1,
      noRefs: true,
      quoteStyle: "double",
      forceQuotes: false,
    }) +
    "---"
  );
}

/** OKF v0.2 sources 条目：resource 必填，其余为可信度信号。 */
export interface OkfSourceEntry {
  id?: string;
  resource: string;
  title?: string;
  author?: string;
  usage_count?: number;
  last_modified?: string;
}

export interface ConceptDocumentInput {
  type: string;
  title?: string;
  description?: string;
  resource?: string;
  tags?: string[];
  generated?: { by: string; at: string };
  frontmatter?: Record<string, unknown>;
  content: string;
}

/** 扩展字段原样保留在 frontmatter 中 */
export function buildConceptContent(document: ConceptDocumentInput): string {
  const frontmatter: Record<string, unknown> = {
    ...(document.frontmatter ?? {}),
    type: document.type,
  };

  if (document.title !== undefined) frontmatter["title"] = document.title;
  if (document.description !== undefined) frontmatter["description"] = document.description;
  if (document.resource !== undefined) frontmatter["resource"] = document.resource;
  if (document.tags !== undefined) frontmatter["tags"] = document.tags;
  if (document.generated !== undefined) frontmatter["generated"] = document.generated;

  return formatFrontmatter(frontmatter) + "\n" + document.content;
}

/** 解析 sources 对象数组，按 resource 去重；兼容 v0.1 遗留的 provenance 字符串数组与字符串形式的 sources 条目。 */
export function extractSources(frontmatter: Record<string, unknown>): OkfSourceEntry[] {
  const byResource = new Map<string, OkfSourceEntry>();
  const raw = frontmatter["sources"];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "string" && item.trim()) {
        byResource.set(item, { resource: item });
      } else if (item && typeof item === "object" && !Array.isArray(item)) {
        const entry = item as Record<string, unknown>;
        if (typeof entry["resource"] === "string" && entry["resource"].trim()) {
          byResource.set(entry["resource"], entry as unknown as OkfSourceEntry);
        }
      }
    }
  }
  for (const resource of extractStringArray(frontmatter, "provenance")) {
    if (resource.trim()) byResource.set(resource, { resource });
  }
  return [...byResource.values()];
}

/** 读取 generated.at（v0.2 最后内容变更时间）。 */
export function extractGeneratedAt(frontmatter: Record<string, unknown>): string | undefined {
  const generated = frontmatter["generated"];
  if (generated && typeof generated === "object" && !Array.isArray(generated)) {
    const at = (generated as Record<string, unknown>)["at"];
    if (typeof at === "string" && at) return at;
  }
  return undefined;
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

/** 合并两侧 sources，按 resource 去重，后者覆盖前者。 */
function mergeSourceEntries(
  oldFrontmatter: Record<string, unknown>,
  newFrontmatter: Record<string, unknown>,
): OkfSourceEntry[] {
  const byResource = new Map<string, OkfSourceEntry>();
  for (const entry of [...extractSources(oldFrontmatter), ...extractSources(newFrontmatter)]) {
    byResource.set(entry.resource, entry);
  }
  return [...byResource.values()];
}

/** 保留双方的未知扩展字段 */
export function mergeConceptContent(existing: string, incoming: string): string {
  const oldDocument = parseFrontmatter(existing);
  const newDocument = parseFrontmatter(incoming);
  const frontmatter = { ...oldDocument.frontmatter, ...newDocument.frontmatter };
  for (const key of ["type", "title", "created"]) {
    if (oldDocument.frontmatter[key] !== undefined) frontmatter[key] = oldDocument.frontmatter[key];
  }
  const tags = mergeStringArrays(oldDocument.frontmatter["tags"], newDocument.frontmatter["tags"]);
  const sources = mergeSourceEntries(oldDocument.frontmatter, newDocument.frontmatter);
  const related = mergeStringArrays(
    oldDocument.frontmatter["related"],
    newDocument.frontmatter["related"],
  );
  if (tags) frontmatter["tags"] = tags;
  if (sources.length > 0) frontmatter["sources"] = sources;
  if (related) frontmatter["related"] = related;
  // v0.1 遗留字段已并入 sources，落盘时清除，避免新旧两种表述混存
  delete frontmatter["provenance"];
  delete frontmatter["timestamp"];

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
