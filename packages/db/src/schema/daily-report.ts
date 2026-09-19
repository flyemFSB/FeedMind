import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

// 定时任务配置表：记录定时执行规则与最新运行状态
export const scheduleTasks = sqliteTable(
  "schedule_tasks",
  {
    id: text("id").primaryKey(), // 任务固定标识，如 'daily-video'
    name: text("name").notNull(),
    cron: text("cron").notNull(),
    timezone: text("timezone").notNull().default("Asia/Shanghai"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    lastRunAt: text("last_run_at"),
    lastRunStatus: text("last_run_status"),
    lastError: text("last_error"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  () => ({
    lastRunStatusCheck: check(
      "ck_schedule_tasks_last_run_status",
      sql`last_run_status IS NULL OR last_run_status IN ('running', 'success', 'failed')`,
    ),
  }),
);

export type ScheduleTaskRow = typeof scheduleTasks.$inferSelect;
export type ScheduleTaskInsert = typeof scheduleTasks.$inferInsert;

// 视频产物记录表：记录每次日报生成的视频元数据与阶段状态
export const videos = sqliteTable(
  "videos",
  {
    id: text("id").primaryKey(),
    scheduleId: text("schedule_id")
      .notNull()
      .references(() => scheduleTasks.id, { onDelete: "cascade" }),
    reportDate: text("report_date").notNull(), // 日报归属日期（格式：YYYY-MM-DD）
    status: text("status").notNull(),
    stage: text("stage"), // 粗粒度阶段或 render/bundling:42% 细进度
    filePath: text("file_path"),
    duration: integer("duration"), // 视频总时长（单位：秒）
    error: text("error"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (table) => ({
    scheduleDateUniq: unique("uq_videos_schedule_date").on(table.scheduleId, table.reportDate),
    scheduleIdx: index("idx_videos_schedule_id").on(table.scheduleId),
    statusCheck: check("ck_videos_status", sql`status IN ('running', 'success', 'failed')`),
  }),
);

export type VideoRow = typeof videos.$inferSelect;
export type VideoInsert = typeof videos.$inferInsert;
