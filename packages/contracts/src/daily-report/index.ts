import { z } from "zod";

// 定时日报任务记账行（与 db schema 对齐，camelCase；API 直接返回 drizzle 行）
export type ScheduleTask = {
  id: string;
  name: string;
  cron: string;
  timezone: string;
  enabled: boolean;
  lastRunAt: string | null;
  lastRunStatus: "running" | "success" | "failed" | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Video = {
  id: string;
  scheduleId: string;
  reportDate: string;
  status: "running" | "success" | "failed";
  filePath: string | null;
  duration: number | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

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

// extract 提炼证据结构（供提炼 agent 结构化输出）
export const extractEvidenceSchema = z.object({
  summary: z.string(),
  facts: z.array(z.string()).default([]),
  quotes: z.array(z.string()).default([]),
  keyContext: z.string().default(""),
});
export type ExtractEvidence = z.infer<typeof extractEvidenceSchema>;

// extract 步输出：今日要点（携带事实、原话引语与背景证据，支持向后兼容）
export const extractItemSchema = z.object({
  title: z.string(),
  url: z.string(),
  source: z.string(),
  summary: z.string(),
  facts: z.array(z.string()).default([]),
  quotes: z.array(z.string()).default([]),
  keyContext: z.string().default(""),
});
export type ExtractItem = z.infer<typeof extractItemSchema>;

export const extractOutputSchema = z.object({
  items: z.array(extractItemSchema),
});
export type ExtractOutput = z.infer<typeof extractOutputSchema>;

// 分镜脚本 JSON（工作流与渲染服务间的类型化契约）
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
