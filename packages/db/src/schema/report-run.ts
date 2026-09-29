import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// 日报运行：全局只有一个调度（存于 setting），故无 schedule_id 外键
export const reportRun = sqliteTable(
  "report_run",
  {
    id: text("id").primaryKey(),
    reportDate: text("report_date").notNull(),
    status: text("status").notNull(),
    stage: text("stage"),
    videoPath: text("video_path"),
    durationSec: integer("duration_sec"),
    error: text("error"),
    finishedAt: text("finished_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (t) => [
    check("ck_report_run_status", sql`status IN ('running', 'success', 'failed')`),
    index("idx_report_run_date").on(t.reportDate, t.createdAt),
  ],
);

export type ReportRunRow = typeof reportRun.$inferSelect;
export type ReportRunInsert = typeof reportRun.$inferInsert;
