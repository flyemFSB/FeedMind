/**
 * Citations Module for OKF v0.1
 *
 * 处理外部引用和来源验证，符合 OKF §8: Citations
 * 参考：https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md#8-citations
 */

import { parseFrontmatter } from "./frontmatter.js";

/** 单个引用的数据结构 */
export interface Citation {
  /** 引用编号（从文档中的 [1], [2]...提取） */
  id: string;
  /** 引用标题或描述 */
  title?: string;
  /** URL 或路径 */
  url: string;
  /** 引用类型：external-url | bundle-internal | references-subdir */
  type: "external-url" | "bundle-internal" | "references-subdir";
}

/** Citations 区块内容 */
export interface CitationsBlock {
  /** 是否包含 Citations 章节 */
  hasCitations: boolean;
  /** 引用列表 */
  citations: Citation[];
  /** 引用数量 */
  count: number;
  /** 正文中是否所有引用都有效 */
  allReferencesValid: boolean;
  /** 未匹配的引用 ID 列表 */
  unmatchedRefs: string[];
  /** 重复的引用 ID */
  duplicateIds: string[];
}

/** Citations 解析选项 */
export interface CitationsOptions {
  /** 是否严格模式（缺失引用时抛出错误） */
  strict?: boolean;
  /** 已知内部概念集合（用于验证内部链接） */
  knownConcepts?: Set<string>;
}

/**
 * 从文档中提取 Citations 区块
 */
export function extractCitations(body: string): CitationsBlock {
  const lines = body.split("\n");

  // 查找 Citations heading
  let citationStartIndex = -1;
  let inCitationSection = false;
  const sectionLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // 检测 Citations 章节头部
    if (/^#{1,6}\s*Citation[s]?\s*$/i.test(line)) {
      inCitationSection = true;
      citationStartIndex = i + 1;
      continue;
    }

    if (inCitationSection) {
      // 遇到新的 heading 表示结束
      if (/^#{1,6}\s+\S/.test(line)) {
        break;
      }

      if (line !== "") sectionLines.push(lines[i]);
    }
  }

  // 检查是否在正文中有引用标记（如 `[1]`, `[2]` 等）
  const referenceMatches = [...body.matchAll(/\[(\d+)\]/g)].map((m) => m[1]);
  const citations = parseCitationList(sectionLines);
  const citationIds = citations.map((citation) => citation.id);
  const knownIds = new Set(citationIds);
  const unmatchedRefs = [...new Set(referenceMatches.filter((id) => !knownIds.has(id)))];
  const duplicateIds = citationIds.filter((id, index) => citationIds.indexOf(id) !== index);

  return {
    hasCitations: citationStartIndex !== -1 && citations.length > 0,
    citations,
    count: citations.length,
    allReferencesValid: unmatchedRefs.length === 0,
    unmatchedRefs,
    duplicateIds: [...new Set(duplicateIds)],
  };
}

/**
 * 解析引用列表文本
 */
function parseCitationList(lines: string[]): Citation[] {
  const citations: Citation[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // 跳过非引用行
    if (!trimmed.startsWith("[") || !trimmed.includes("]")) continue;

    // 解析格式：[1] [Title](url) 或 [1] url
    const citMatch = trimmed.match(/^\[(\d+)\]\s*\[([^\]]+)\]\s*\(([^)]+)\)/);
    if (citMatch) {
      const [, id, title, url] = citMatch;
      citations.push(parseCitationReference(id, title, url));
      continue;
    }

    // 简单格式：[1] url
    const simpleMatch = trimmed.match(/^\[(\d+)\]\s*(.+)$/);
    if (simpleMatch) {
      const [, id, url] = simpleMatch;
      citations.push({
        id,
        url: url.trim(),
        type: extractCitationType(url),
      });
    }
  }

  // 按 ID 排序
  return citations.sort((a, b) => parseInt(a.id) - parseInt(b.id));
}

/**
 * 判断引用类型
 */
function extractCitationType(url: string): Citation["type"] {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return "external-url";
  }

  if (url.startsWith("/") || url.startsWith("./") || url.includes("/")) {
    return "bundle-internal";
  }

  return "references-subdir";
}

/**
 * 将文本中的引用标记解析为 Citation
 */
export function resolveBodyReferences(body: string, _knownConcepts?: Set<string>): Citation[] {
  const citations: Citation[] = [];
  const referenceRegex = /\[(\d+)\]/g;
  let match: RegExpExecArray | null;

  while ((match = referenceRegex.exec(body)) !== null) {
    const refId = match[1];

    // 查找对应的引用定义
    const definitionMatch = body.match(
      new RegExp(`\\[${refId}\\]\\s*\\[([^\\]]+)\\]\\s*\\(([^)]+)\\)`, "i"),
    );
    if (definitionMatch) {
      const [, title, url] = definitionMatch;
      citations.push({
        id: refId,
        title: title.trim(),
        url: url.trim(),
        type: extractCitationType(url),
      });
    }
  }

  return citations;
}

/**
 * 创建 Citations 区块模板
 */
export function createCitationsBlock(
  citations: Array<{ id: string; title?: string; url: string }>,
): string {
  if (citations.length === 0) {
    return "";
  }

  // 确保按 ID 排序
  const sorted = [...citations].sort((a, b) => parseInt(a.id) - parseInt(b.id));

  let markdown = "\n# Citations\n\n";

  for (const cit of sorted) {
    if (cit.title) {
      markdown += `[${cit.id}] [${cit.title}](${cit.url})\n`;
    } else {
      markdown += `[${cit.id}] ${cit.url}\n`;
    }
  }

  return markdown;
}

/**
 * 验证并添加引用到现有文档
 */
export function validateAndAppendCitations(
  document: string,
  newCitations: Array<{ id: string; title?: string; url: string }>,
): { validated: boolean; errors: string[]; updatedDocument: string } {
  const parsed = parseFrontmatter(document);
  const existingCitations = extractCitations(parsed.body).citations;

  const errors: string[] = [];

  // 检查重复 ID
  const existingIds = new Set(existingCitations.map((c) => c.id));
  const seenNewIds = new Set<string>();
  const newDuplicateIds = new Set<string>();
  for (const citation of newCitations) {
    if (existingIds.has(citation.id) || seenNewIds.has(citation.id)) {
      newDuplicateIds.add(citation.id);
    }
    seenNewIds.add(citation.id);
  }

  if (newDuplicateIds.size > 0) {
    errors.push(`引用编号重复：${[...newDuplicateIds].join(", ")}`);
  }

  // 合并新引用
  const merged = [...existingCitations, ...newCitations];

  // 构建更新后的文档
  let updatedBody = parsed.body;

  // 移除旧的 Citations 区块
  updatedBody = removeCitationsSection(updatedBody);

  // 添加新 Citations
  if (merged.length > 0) {
    updatedBody += createCitationsBlock(merged);
  }

  return {
    validated: errors.length === 0,
    errors,
    updatedDocument: parsed.hasFrontmatter ? parsed.rawBlock + updatedBody : updatedBody,
  };
}

function removeCitationsSection(body: string): string {
  const lines = body.split("\n");
  const kept: string[] = [];
  let inCitationSection = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (/^#{1,6}\s*Citations?\s*$/i.test(line)) {
      inCitationSection = true;
      continue;
    }
    if (inCitationSection && /^#{1,6}\s+\S/.test(line)) {
      inCitationSection = false;
    }
    if (!inCitationSection) kept.push(rawLine);
  }

  return kept
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}

/**
 * 辅助函数：解析引用引用
 */
function parseCitationReference(id: string, title: string, url: string): Citation {
  return {
    id,
    title: title.trim(),
    url: url.trim(),
    type: extractCitationType(url),
  };
}

/**
 * 检查文档是否需要 Citations（基于关键词和声明式内容）
 */
export function needsCitations(content: string): boolean {
  const claimKeywords = [
    "研究表明",
    "数据显示",
    "根据",
    "据称",
    "宣称",
    "source",
    "evidence",
    "study",
    "research",
    "报告",
    "数据",
  ];

  return claimKeywords.some((keyword) => content.includes(keyword));
}
