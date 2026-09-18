import { and, desc, eq } from "drizzle-orm";
import { db, operationLog } from "@feedmind/db";
import type { OperationLogInsert } from "@feedmind/db";
import { logger } from "../../lib/logger.js";

// 操作日志：用户层面数据增删改查的审计记录（非接口调用日志）。
// 表结构由 @feedmind/db ensureSchema 统一管理。

export type OpsAction = "create" | "update" | "delete" | "import" | "run";
export type OpsResult = "success" | "failed";

export interface OpsLogEntry {
  action: OpsAction;
  /** 对象类型：wiki_space / wiki_page / wiki_source / rss_source / daily_report */
  target: string;
  targetName: string;
  detail?: string;
  result?: OpsResult;
}

/** 记录一条操作日志。审计写入失败不影响业务，只告警不抛出。 */
export async function logOperation(entry: OpsLogEntry): Promise<void> {
  try {
    const row: OperationLogInsert = {
      ts: new Date().toISOString(),
      action: entry.action,
      target: entry.target,
      targetName: entry.targetName,
      detail: entry.detail ?? null,
      result: entry.result ?? "success",
    };
    await db.insert(operationLog).values(row);
  } catch (err) {
    logger.warn({ err, entry }, "写入操作审计日志失败");
  }
}

export interface OpsLogRow {
  id: number;
  ts: string;
  action: OpsAction;
  target: string;
  targetName: string;
  detail: string | null;
  result: OpsResult;
}

export interface OpsLogFilter {
  action?: OpsAction;
  target?: string;
  result?: OpsResult;
}

export async function listOperations(
  limit = 50,
  offset = 0,
  filter: OpsLogFilter = {},
): Promise<{ items: OpsLogRow[]; total: number }> {
  const where = [];
  if (filter.action) where.push(eq(operationLog.action, filter.action));
  if (filter.target) where.push(eq(operationLog.target, filter.target));
  if (filter.result) where.push(eq(operationLog.result, filter.result));
  const whereArr = where.length ? and(...where) : undefined;

  const [countRows, rows] = await Promise.all([
    db.select({ id: operationLog.id }).from(operationLog).where(whereArr),
    db
      .select()
      .from(operationLog)
      .where(whereArr)
      .orderBy(desc(operationLog.id))
      .limit(limit)
      .offset(offset),
  ]);

  return {
    items: rows.map((r) => ({
      ...r,
      action: r.action as OpsAction,
      result: r.result as OpsResult,
    })),
    total: countRows.length,
  };
}
