import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// 操作审计日志表：记录关键业务操作行为与执行结果
export const operationLog = sqliteTable(
  "operation_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ts: text("ts")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    action: text("action").notNull(),
    target: text("target").notNull(),
    targetName: text("target_name").notNull(),
    detail: text("detail"),
    result: text("result").notNull().default("success"),
  },
  (table) => ({
    tsIdx: index("idx_operation_log_ts").on(table.ts),
    actionCheck: check(
      "ck_operation_log_action",
      sql`action IN ('create', 'update', 'delete', 'import', 'run')`,
    ),
    resultCheck: check("ck_operation_log_result", sql`result IN ('success', 'failed')`),
  }),
);

export type OperationLogRow = typeof operationLog.$inferSelect;
export type OperationLogInsert = typeof operationLog.$inferInsert;
