import { and, count, desc, eq } from "drizzle-orm";
import { db, operationLog } from "@feedmind/db";
import { logger } from "../../lib/logger.js";

// 操作日志：用户层面数据增删改查的审计记录（非接口调用日志）。

export type OpsAction = "create" | "update" | "delete" | "import" | "run";
export type OpsResult = "success" | "failed";

export interface OpsLogEntry {
  action: OpsAction;
  /** 对象类别：wiki / source / feed / report / model / tool / cookie / chat / system */
  category: string;
  targetName: string;
  /** 对象标识（概念 id / source id / thread id），便于从日志回跳对象 */
  targetId?: string;
  detail?: string;
  result?: OpsResult;
}

/** 记录一条操作日志。审计写入失败不影响业务，只告警不抛出。 */
export async function logOperation(entry: OpsLogEntry): Promise<void> {
  try {
    await db.insert(operationLog).values({
      category: entry.category,
      action: entry.action,
      targetId: entry.targetId ?? null,
      targetName: entry.targetName,
      detail: entry.detail ?? null,
      result: entry.result ?? "success",
    });
  } catch (err) {
    logger.warn({ err, entry }, "写入操作审计日志失败");
  }
}

export interface OpsLogRow {
  id: number;
  created_at: string;
  category: string;
  action: OpsAction;
  target_id: string | null;
  target_name: string;
  detail: string | null;
  result: OpsResult;
}

export interface OpsLogFilter {
  action?: OpsAction;
  category?: string;
  result?: OpsResult;
}

export async function listOperations(
  limit = 50,
  offset = 0,
  filter: OpsLogFilter = {},
): Promise<{ items: OpsLogRow[]; total: number }> {
  const conditions = [];
  if (filter.action) conditions.push(eq(operationLog.action, filter.action));
  if (filter.category) conditions.push(eq(operationLog.category, filter.category));
  if (filter.result) conditions.push(eq(operationLog.result, filter.result));
  const where = conditions.length ? and(...conditions) : undefined;

  const [countRows, rows] = await Promise.all([
    db.select({ value: count() }).from(operationLog).where(where),
    db
      .select()
      .from(operationLog)
      .where(where)
      .orderBy(desc(operationLog.id))
      .limit(limit)
      .offset(offset),
  ]);

  return {
    items: rows.map((r) => ({
      id: r.id,
      created_at: r.createdAt,
      category: r.category,
      action: r.action as OpsAction,
      target_id: r.targetId,
      target_name: r.targetName,
      detail: r.detail,
      result: r.result as OpsResult,
    })),
    total: countRows[0]?.value ?? 0,
  };
}
