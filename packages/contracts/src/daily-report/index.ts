import { z } from "zod";

// 定时日报任务记账行（与 db schema 对齐，camelCase；API 直接返回 drizzle 行）
export const scheduleTaskSchema = z.object({
  id: z.string(),
  name: z.string(),
  cron: z.string(),
  timezone: z.string(),
  enabled: z.boolean(),
  lastRunAt: z.string().nullable(),
  lastRunStatus: z.enum(["running", "success", "failed"]).nullable(),
  lastError: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ScheduleTask = z.infer<typeof scheduleTaskSchema>;

export const videoSchema = z.object({
  id: z.string(),
  scheduleId: z.string(),
  reportDate: z.string(),
  status: z.enum(["running", "success", "failed"]),
  filePath: z.string().nullable(),
  duration: z.number().nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Video = z.infer<typeof videoSchema>;

// 定时任务创建/更新入参（PUT /daily-report/schedules/:id）
export const scheduleUpsertSchema = z.object({
  name: z.string().min(1),
  cron: z.string().min(1, "cron 表达式不能为空"),
  timezone: z.string().optional(),
  enabled: z.boolean().optional(),
});
export type ScheduleUpsert = z.infer<typeof scheduleUpsertSchema>;

// 手动触发入参（POST /daily-report/trigger）
export const triggerReportSchema = z.object({
  scheduleId: z.string().min(1),
});
export type TriggerReport = z.infer<typeof triggerReportSchema>;

// extract 步输入：单条待提炼内容（服务层抓取后传入）
export const extractFeedSchema = z.object({
  id: z.string().optional(),
  title: z.string(),
  link: z.string(),
  description: z.string().nullable(),
  source: z.string(),
});
export type ExtractFeed = z.infer<typeof extractFeedSchema>;

// extract 步输出：今日要点
export const extractItemSchema = z.object({
  title: z.string(),
  url: z.string(),
  summary: z.string(),
  source: z.string(),
});
export type ExtractItem = z.infer<typeof extractItemSchema>;

export const extractOutputSchema = z.object({
  items: z.array(extractItemSchema),
});
export type ExtractOutput = z.infer<typeof extractOutputSchema>;

// 分镜脚本 JSON（g1 敲定的类型化交接契约）
export const dailyReportScriptSchema = z.object({
  date: z.string(),
  opening: z.object({ hook: z.string() }),
  items: z.array(
    z.object({
      title: z.string(),
      points: z.array(z.string()),
      quote: z.string().nullable(),
      narration: z.string(),
      source: z.string(),
      image: z.string().nullable(),
    }),
  ),
  closing: z.object({ summary: z.string() }),
});
export type DailyReportScript = z.infer<typeof dailyReportScriptSchema>;
