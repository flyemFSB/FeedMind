import { client } from "@feedmind/db";
import { logger } from "../../lib/logger.js";

// 操作日志：用户层面数据增删改查的审计记录（非接口调用日志）。

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

// 表结构运行时创建（与 wiki_fts 一致），避免依赖 db:push 迁移，桌面端开箱即用。
// 成功后缓存标志：每条日志都跑一次 DDL 是白费两次往返。
let tableReady = false;

async function ensureOpsLogTable(): Promise<void> {
  if (tableReady) return;
  await client.execute(`CREATE TABLE IF NOT EXISTS operation_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    action TEXT NOT NULL,
    target TEXT NOT NULL,
    target_name TEXT NOT NULL,
    detail TEXT,
    result TEXT NOT NULL DEFAULT 'success'
  )`);
  tableReady = true;
}

/** 记录一条操作日志。审计写入失败不影响业务，只告警不抛出。 */
export async function logOperation(entry: OpsLogEntry): Promise<void> {
  try {
    await ensureOpsLogTable();
    await client.execute({
      sql: "INSERT INTO operation_log (ts, action, target, target_name, detail, result) VALUES (?, ?, ?, ?, ?, ?)",
      args: [
        Date.now(),
        entry.action,
        entry.target,
        entry.targetName,
        entry.detail ?? null,
        entry.result ?? "success",
      ],
    });
  } catch (err) {
    logger.warn({ err, entry }, "写入操作日志失败");
  }
}

export interface OpsLogRow {
  id: number;
  ts: number;
  action: OpsAction;
  target: string;
  targetName: string;
  detail: string | null;
  result: OpsResult;
}

export interface OpsLogFilter {
  action?: OpsAction;
  result?: OpsResult;
}

export async function listOperations(
  limit = 50,
  offset = 0,
  filter: OpsLogFilter = {},
): Promise<{ items: OpsLogRow[]; total: number }> {
  await ensureOpsLogTable();
  // 筛选条件动态拼接：仅两个可空等值条件，无需 ORM 层抽象
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (filter.action) {
    where.push("action = ?");
    args.push(filter.action);
  }
  if (filter.result) {
    where.push("result = ?");
    args.push(filter.result);
  }
  const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  const totalRes = await client.execute({
    sql: `SELECT count(*) AS n FROM operation_log${whereSql}`,
    args,
  });
  const total = Number(totalRes.rows[0]?.["n"] ?? 0);
  const rows = await client.execute({
    sql: `SELECT id, ts, action, target, target_name AS targetName, detail, result FROM operation_log${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`,
    args: [...args, limit, offset],
  });
  return {
    items: rows.rows as unknown as OpsLogRow[],
    total,
  };
}
