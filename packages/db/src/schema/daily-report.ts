import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// 定时日报任务记账表：仅作业务记账与 web 展示；触发由调度器读 enabled 行驱动。
// 调度本身不在此表（避免重复造 cron 引擎），触发/状态回写都在此表留下痕迹。
export const scheduleTasks = sqliteTable("schedule_tasks", {
  id: text("id").primaryKey(), // 'daily-video'
  name: text("name").notNull(),
  cron: text("cron").notNull(),
  timezone: text("timezone").notNull().default("Asia/Shanghai"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  lastRunAt: text("last_run_at"),
  lastRunStatus: text("last_run_status"), // 'running' | 'success' | 'failed'
  lastError: text("last_error"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export type ScheduleTaskRow = typeof scheduleTasks.$inferSelect;
export type ScheduleTaskInsert = typeof scheduleTasks.$inferInsert;

// 日报视频产物：一次运行一行，占位阶段产物文件可为空
export const videos = sqliteTable("videos", {
  id: text("id").primaryKey(),
  scheduleId: text("schedule_id").notNull(),
  reportDate: text("report_date").notNull(),
  status: text("status").notNull(), // 'running' | 'success' | 'failed'
  stage: text("stage"), // 运行中阶段：sync | extract | tts | render
  filePath: text("file_path"),
  duration: integer("duration"),
  error: text("error"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export type VideoRow = typeof videos.$inferSelect;
export type VideoInsert = typeof videos.$inferInsert;
