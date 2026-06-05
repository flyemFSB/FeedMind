import { isAbsolutePath, normalizePath } from "./paths.js";

/**
 * A parsed FILE block from LLM output.
 */
export interface ParsedFileBlock {
  path: string;
  content: string;
}

export interface ParseFileBlocksResult {
  blocks: ParsedFileBlock[];
  warnings: string[];
}

// Matchers for FILE block markers
const OPENER_LINE = /^---\s*FILE:\s*(.+?)\s*---\s*$/i;
const CLOSER_LINE = /^---\s*END\s+FILE\s*---\s*$/i;
const FENCE_LINE = /^\s{0,3}(```+|~~~+)/;

/**
 * Parse LLM output into FILE blocks with path traversal protection.
 */
export function parseFileBlocks(text: string): ParseFileBlocksResult {
  const normalized = text.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");

  const blocks: ParsedFileBlock[] = [];
  const warnings: string[] = [];

  let i = 0;
  while (i < lines.length) {
    const openerMatch = OPENER_LINE.exec(lines[i]);
    if (!openerMatch) {
      i++;
      continue;
    }
    const path = openerMatch[1].trim();
    i++; // consume opener

    const contentLines: string[] = [];
    let fenceMarker: string | null = null;
    let closed = false;

    while (i < lines.length) {
      const line = lines[i];

      // Track fenced code blocks so we don't mistake ---END FILE--- inside them
      const fenceMatch = FENCE_LINE.exec(line);
      if (fenceMatch) {
        const run = fenceMatch[1];
        const char = run[0];
        const len = run.length;
        if (fenceMarker === null) {
          fenceMarker = char;
        } else if (char === fenceMarker && len >= (fenceMarker.length)) {
          fenceMarker = null;
        }
        contentLines.push(line);
        i++;
        continue;
      }

      if (fenceMarker === null && CLOSER_LINE.test(line)) {
        closed = true;
        i++;
        break;
      }

      contentLines.push(line);
      i++;
    }

    if (!closed) {
      warnings.push(`FILE block "${path || "(unnamed)"}" was not closed before end of stream — dropped.`);
      continue;
    }

    if (!path) {
      warnings.push("FILE block with empty path skipped.");
      continue;
    }

    if (!isSafeIngestPath(path)) {
      warnings.push(`FILE block with unsafe path "${path}" rejected.`);
      continue;
    }

    blocks.push({ path, content: contentLines.join("\n") });
  }

  return { blocks, warnings };
}

/**
 * Check if a FILE block path is safe to write.
 * Only allows paths under wiki/, rejects .., absolute paths, etc.
 */
export function isSafeIngestPath(p: string): boolean {
  if (typeof p !== "string" || p.trim().length === 0) return false;
  if (/[\x00-\x1f]/.test(p)) return false;
  if (isAbsolutePath(p)) return false;
  const normalized = normalizePath(p);
  const segments = normalized.split("/");
  if (segments.some((s) => s === ".." || s === ".")) return false;

  // Must live under wiki/
  if (!normalized.startsWith("wiki/")) return false;

  return true;
}

/**
 * Sanitize ingested file content: remove wrapping code fences, fix common LLM errors.
 */
export function sanitizeIngestedFileContent(content: string): string {
  let result = content.trim();

  // Remove wrapping ```yaml ... ``` or ```markdown ... ```
  const fencingMatch = result.match(/^```(?:\w+)?\n([\s\S]*?)```$/);
  if (fencingMatch) {
    result = fencingMatch[1].trim();
  }

  // Remove "frontmatter:" prefix that LLMs sometimes add
  result = result.replace(/^frontmatter:\s*\n/i, "");

  return result;
}

/**
 * Check if a path is a log path.
 */
export function isLogPath(relativePath: string): boolean {
  return relativePath === "wiki/log.md" || relativePath.endsWith("/log.md");
}

/**
 * Check if a path is a listing page (index or overview).
 */
export function isListingPath(relativePath: string): boolean {
  return (
    relativePath === "wiki/index.md" ||
    relativePath.endsWith("/index.md") ||
    relativePath === "wiki/overview.md" ||
    relativePath.endsWith("/overview.md")
  );
}
