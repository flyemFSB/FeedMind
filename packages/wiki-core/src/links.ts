import path from "node:path/posix";

export interface MarkdownLink {
  label: string;
  target: string;
}

const INLINE_LINK_RE = /(?<!!)\[([^\]]*)\]\(\s*(<[^>]*>|[^)\s]+)(?:\s+["'][^)]*["'])?\s*\)/g;
const REFERENCE_LINK_RE = /(?<!!)\[([^\]]+)\]\s*\[([^\]]*)\]/g;
const SHORTCUT_LINK_RE = /(?<!!)(?<!\])\[([^\]]+)\](?!\s*(?:\(|\[|:))/g;
const REFERENCE_DEFINITION_RE =
  /^\s{0,3}\[([^\]]+)\]:\s*(<[^>]*>|[^\s]+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*$/gm;

function withoutFencedCode(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, "")
    .replace(/~~~[\s\S]*?~~~/g, "")
    .replace(/`[^`\r\n]*`/g, "");
}

function normalizeReferenceLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

function parseTarget(rawTarget: string): string {
  const target = rawTarget.trim();
  return target.startsWith("<") && target.endsWith(">") ? target.slice(1, -1) : target;
}

function readReferenceDefinitions(content: string): Map<string, string> {
  const definitions = new Map<string, string>();
  const regex = new RegExp(REFERENCE_DEFINITION_RE.source, "gm");
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    definitions.set(normalizeReferenceLabel(match[1] ?? ""), parseTarget(match[2] ?? ""));
  }
  return definitions;
}

export function extractMarkdownLinks(content: string): MarkdownLink[] {
  const links: MarkdownLink[] = [];
  const clean = withoutFencedCode(content);
  const regex = new RegExp(INLINE_LINK_RE.source, "g");
  let match: RegExpExecArray | null;

  while ((match = regex.exec(clean)) !== null) {
    const rawTarget = (match[2] ?? "").trim();
    links.push({
      label: (match[1] ?? "").trim(),
      target: parseTarget(rawTarget),
    });
  }

  const definitions = readReferenceDefinitions(clean);
  const referenceRegex = new RegExp(REFERENCE_LINK_RE.source, "g");
  while ((match = referenceRegex.exec(clean)) !== null) {
    const referenceId = normalizeReferenceLabel(match[2] || match[1] || "");
    const target = definitions.get(referenceId);
    if (target) links.push({ label: (match[1] ?? "").trim(), target });
  }

  const shortcutRegex = new RegExp(SHORTCUT_LINK_RE.source, "g");
  while ((match = shortcutRegex.exec(clean)) !== null) {
    const target = definitions.get(normalizeReferenceLabel(match[1] ?? ""));
    if (target) links.push({ label: (match[1] ?? "").trim(), target });
  }

  return links;
}

export function conceptIdFromPath(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  return normalized.replace(/\.md$/i, "");
}

export function normalizeConceptId(value: string): string {
  const normalized = value.replace(/\\/g, "/").replace(/^\/+/, "");
  const withoutExtension = normalized.replace(/\.md$/i, "");
  const parts = withoutExtension.split("/");
  const resolved: string[] = [];

  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (resolved.length === 0) return "";
      resolved.pop();
      continue;
    }
    resolved.push(part);
  }

  return resolved.join("/");
}

export function resolveConceptLink(currentConceptId: string, target: string): string | null {
  const trimmed = target.trim();
  if (
    !trimmed ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("//") ||
    /^[a-z][a-z\d+.-]*:/i.test(trimmed)
  ) {
    return null;
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    decoded = trimmed;
  }

  const pathOnly = decoded.split(/[?#]/, 1)[0] ?? "";
  if (!pathOnly || pathOnly.endsWith("/")) return null;

  const base = pathOnly.startsWith("/")
    ? pathOnly
    : path.join(path.dirname(currentConceptId), pathOnly);
  const conceptId = normalizeConceptId(base);
  return conceptId || null;
}

export function extractConceptLinks(content: string, currentConceptId: string): string[] {
  return extractMarkdownLinks(content)
    .map((link) => resolveConceptLink(currentConceptId, link.target))
    .filter((id): id is string => id !== null);
}

export function formatConceptLink(label: string, conceptId: string): string {
  const encodedId = conceptId.split("/").map(encodeURIComponent).join("/");
  return `[${label}](/${encodedId}.md)`;
}
