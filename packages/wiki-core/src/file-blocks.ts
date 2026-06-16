import { isAbsolutePath, normalizePath } from "./paths.js";

/** LLM 输出的 FILE block 解析结果 */
export interface ParsedFileBlock {
  path: string;
  content: string;
}

export interface ParseFileBlocksResult {
  blocks: ParsedFileBlock[];
  warnings: string[];
}

// FILE block 标记的正则匹配
const OPENER_LINE = /^---\s*FILE:\s*(.+?)\s*---\s*$/i;
const CLOSER_LINE = /^---\s*END\s+FILE\s*---\s*$/i;
const FENCE_LINE = /^\s{0,3}(```+|~~~+)/;

/**
 * 解析 LLM 输出中的 FILE block，含路径穿越防护。
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

      // 追踪代码 fence，避免将 ``` 内部的 ---END FILE--- 误判为 block 结束
      const fenceMatch = FENCE_LINE.exec(line);
      if (fenceMatch) {
        const run = fenceMatch[1];
        const char = run[0];
        const len = run.length;
        if (fenceMarker === null) {
          fenceMarker = char;
        } else if (char === fenceMarker && len >= fenceMarker.length) {
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
      warnings.push(
        `FILE block "${path || "(unnamed)"}" was not closed before end of stream — dropped.`,
      );
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
 * 检查 FILE block 路径是否安全可写入。
 * 只允许 wiki/ 下的路径，拒绝 ..、绝对路径等。
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
 * 净化导入的文件内容：移除外层代码包围、修复 LLM 常见错误。
 */
export function sanitizeIngestedFileContent(content: string): string {
  let result = content.trim();

  // 移除 ```yaml ... ``` 或 ```markdown ... ``` 外层包围
  const fencingMatch = result.match(/^```(?:\w+)?\n([\s\S]*?)```$/);
  if (fencingMatch) {
    result = fencingMatch[1].trim();
  }

  // 移除 LLM 有时会多加的 "frontmatter:" 前缀
  result = result.replace(/^frontmatter:\s*\n/i, "");

  return result;
}

/** 判断路径是否为日志页面 */
export function isLogPath(relativePath: string): boolean {
  return relativePath === "wiki/log.md" || relativePath.endsWith("/log.md");
}

/** 判断路径是否为索引/总览页面 */
export function isListingPath(relativePath: string): boolean {
  return (
    relativePath === "wiki/index.md" ||
    relativePath.endsWith("/index.md") ||
    relativePath === "wiki/overview.md" ||
    relativePath.endsWith("/overview.md")
  );
}
