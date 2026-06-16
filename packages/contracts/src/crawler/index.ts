import { z } from "zod";

// ─── 任务状态 ───────────────────────────────────────────────────────
export const taskStatusSchema = z.enum(["queued", "running", "completed", "failed", "cancelled"]);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

// ─── 任务创建 ───────────────────────────────────────────────────────
export const taskCreateSchema = z.object({
  route: z.string(),
  params: z.record(z.string(), z.unknown()),
  cookies: z.string().optional(),
  proxy_url: z.string().optional(),
  max_items: z.number().int().positive().default(50),
});
export type TaskCreate = z.infer<typeof taskCreateSchema>;

// ─── 任务读取 ───────────────────────────────────────────────────────
export const taskReadSchema = z.object({
  id: z.string(),
  route: z.string(),
  params: z.string(),
  cookies: z.string().nullable(),
  proxy_url: z.string().nullable(),
  max_items: z.number().int(),
  status: taskStatusSchema,
  progress: z.number().int().nullable(),
  error: z.string().nullable(),
  rss_url: z.string().nullable(),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
  created_at: z.string(),
});
export type TaskRead = z.infer<typeof taskReadSchema>;

export const taskListItemSchema = taskReadSchema.pick({
  id: true,
  route: true,
  status: true,
  progress: true,
  error: true,
  started_at: true,
  finished_at: true,
  created_at: true,
});
export type TaskListItem = z.infer<typeof taskListItemSchema>;
