import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// 操作审计：只增不改，故只有 created_at
export const operationLog = sqliteTable(
  "operation_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    category: text("category").notNull(),
    action: text("action").notNull(),
    targetId: text("target_id"),
    targetName: text("target_name").notNull(),
    detail: text("detail"),
    result: text("result").notNull().default("success"),
  },
  (t) => [
    check(
      "ck_operation_log_action",
      sql`action IN ('create', 'update', 'delete', 'import', 'run')`,
    ),
    check("ck_operation_log_result", sql`result IN ('success', 'failed')`),
    index("idx_operation_log_created").on(t.createdAt),
    index("idx_operation_log_category").on(t.category, t.createdAt),
  ],
);

export type OperationLogRow = typeof operationLog.$inferSelect;
export type OperationLogInsert = typeof operationLog.$inferInsert;
