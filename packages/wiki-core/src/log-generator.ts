/**
 * Log.md Generator for OKF v0.1
 *
 * 自动生成符合 OKF 规范的 log.md 文件
 * 参考：https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md#7-log-files
 */

import { formatConceptLink, normalizeConceptId } from "./links.js";

/** 日志条目类型 */
export type LogEntryType = "Creation" | "Update" | "Deprecation" | "Deletion" | "Migration";

/** 单条日志条目 */
export interface LogEntry {
  /** 类型 */
  type: LogEntryType;
  /** 概念 ID */
  conceptId: string;
  /** 标题 */
  title?: string;
  /** 描述（可选） */
  description?: string;
  /** 日期（默认今天） */
  date?: string;
}

/**
 * 格式化引导词（加粗样式）
 */
function formatGuidingWord(type: LogEntryType): string {
  const labels: Record<LogEntryType, string> = {
    Creation: "创建",
    Update: "更新",
    Deprecation: "弃用",
    Deletion: "删除",
    Migration: "迁移",
  };
  return `**${labels[type]}**`;
}

/**
 * 生成单个日志条目
 */
function formatLogEntry(entry: LogEntry): string {
  const conceptId = normalizeConceptId(entry.conceptId) || entry.conceptId;
  const link = formatConceptLink(entry.title ?? entry.conceptId, conceptId);
  const desc = entry.description ? `：${entry.description}` : "";

  let line = "";
  switch (entry.type) {
    case "Creation":
      line = `${formatGuidingWord("Creation")}：${link}。`;
      break;
    case "Update":
      line = `${formatGuidingWord("Update")}：${link}${desc}。`;
      break;
    case "Deprecation":
      line = `${formatGuidingWord("Deprecation")}：${link}已弃用。`;
      break;
    case "Deletion":
      line = `${formatGuidingWord("Deletion")}：已移除${link}。`;
      break;
    case "Migration":
      line = `${formatGuidingWord("Migration")}：${link}${desc}。`;
      break;
  }

  return `* ${line}`;
}

/**
 * 按日期分组构建 log.md 内容
 */
export function buildLogMd(entries: LogEntry[]): string {
  if (entries.length === 0) {
    return "# 更新日志\n\n暂无更新记录。\n";
  }

  // 按日期分组
  const grouped = new Map<string, LogEntry[]>();

  for (const entry of entries) {
    const dateStr = entry.date ?? new Date().toISOString().slice(0, 10);

    // 验证日期格式（YYYY-MM-DD）
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      throw new Error(`Invalid date format: ${dateStr}. Must be YYYY-MM-DD`);
    }

    const list = grouped.get(dateStr) ?? [];
    list.push(entry);
    grouped.set(dateStr, list);
  }

  // 按日期倒序排序（最新在前，符合 OKF §7 要求）
  const sortedDates = Array.from(grouped.keys()).sort().reverse();

  // 构建 markdown
  let markdown = "# 更新日志\n\n";

  for (const date of sortedDates) {
    const entriesForDate = grouped.get(date)!;
    markdown += `## ${date}\n\n`;

    for (const entry of entriesForDate) {
      markdown += `${formatLogEntry(entry)}\n`;
    }

    markdown += "\n";
  }

  return markdown.trim() + "\n";
}

/**
 * 创建新的 log.md 文件
 */
export function createNewLog(): string {
  return "# 更新日志\n\n暂无更新记录。\n";
}

/**
 * 追加日志条目到现有 log.md
 */
export function appendToLog(existingLog: string, newEntries: LogEntry[]): string {
  // 检查是否已有内容
  if (existingLog.trim().length === 0 || !existingLog.includes("# 更新日志")) {
    return buildLogMd(newEntries);
  }

  // 解析现有条目（简单方法：提取日期区块）
  const lines = existingLog.split("\n");
  const lastHeadingIndex = lines.findLastIndex((line) => /^## \d{4}-\d{2}-\d{2}$/.test(line));

  if (lastHeadingIndex === -1) {
    // 无日期区块，直接追加到末尾或替换
    return buildLogMd(newEntries);
  }

  // 获取最新的日期
  const lastDateLine = lines[lastHeadingIndex];
  const lastDate = lastDateLine.replace(/^## /, "");

  // 为新条目添加相同日期（如果未指定）
  const datedEntries = newEntries.map((e) => ({
    ...e,
    date: e.date ?? lastDate,
  }));

  const rendered = datedEntries.map((entry) => formatLogEntry(entry)).join("\n");
  const insertAt = lines.slice(0, lastHeadingIndex + 1).join("\n").length;
  return `${existingLog.slice(0, insertAt)}\n${rendered}\n${existingLog.slice(insertAt)}`;
}

/**
 * 生成标准化日志条目
 */
export function createCreationEntry(
  conceptId: string,
  title?: string,
  options?: { date?: string; description?: string },
): LogEntry {
  return {
    type: "Creation",
    conceptId,
    title,
    description: options?.description,
    date: options?.date,
  };
}

/**
 * 生成更新日志条目
 */
export function createUpdateEntry(
  conceptId: string,
  title?: string,
  options?: { date?: string; description?: string },
): LogEntry {
  return {
    type: "Update",
    conceptId,
    title,
    description: options?.description,
    date: options?.date,
  };
}

/**
 * 生成分批更新日志（批量操作时调用）
 */
export function createBatchUpdateLog(
  changes: Array<{ conceptId: string; title: string; action: "created" | "updated" | "deleted" }>,
  options?: { date?: string },
): string {
  const entries: LogEntry[] = changes.map((change) => ({
    type:
      change.action === "created"
        ? "Creation"
        : change.action === "updated"
          ? "Update"
          : "Deletion",
    conceptId: change.conceptId,
    title: change.title,
    date: options?.date,
  }));

  return buildLogMd(entries);
}
