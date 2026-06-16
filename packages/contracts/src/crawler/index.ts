import { z } from "zod";

// ─── 平台枚举 ───────────────────────────────────────────────────
export const platformSchema = z.enum(["xhs", "dy", "ks", "bili", "wb", "zhihu", "tieba"]);
export type Platform = z.infer<typeof platformSchema>;

export const crawlerTypeSchema = z.enum(["search", "detail", "creator"]);
export type CrawlerType = z.infer<typeof crawlerTypeSchema>;

export const taskStatusSchema = z.enum(["queued", "running", "completed", "failed", "cancelled"]);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

// ─── 平台元数据 ─────────────────────────────────────────────────
export const platformInfoSchema = z.object({
  code: platformSchema,
  name: z.string(),
  crawler_types: z.array(crawlerTypeSchema),
});
export type PlatformInfo = z.infer<typeof platformInfoSchema>;

export const PLATFORMS: PlatformInfo[] = [
  { code: "xhs", name: "小红书", crawler_types: ["search", "detail", "creator"] },
  { code: "dy", name: "抖音", crawler_types: ["search", "detail", "creator"] },
  { code: "bili", name: "B站", crawler_types: ["search", "detail", "creator"] },
  { code: "wb", name: "微博", crawler_types: ["search", "detail"] },
  { code: "zhihu", name: "知乎", crawler_types: ["search", "detail"] },
  { code: "ks", name: "快手", crawler_types: ["search", "detail"] },
  { code: "tieba", name: "贴吧", crawler_types: ["search", "detail"] },
];

// ─── 任务 ────────────────────────────────────────────────────────
export const taskCreateSchema = z.object({
  platform: platformSchema,
  crawler_type: crawlerTypeSchema,
  keywords: z.array(z.string().min(1)).optional(),
  specified_urls: z.array(z.string().url()).optional(),
  creator_ids: z.array(z.string().min(1)).optional(),
  cookies: z.string().optional(),
  proxy_url: z.string().optional(),
  max_notes: z.number().int().positive().default(100),
  max_concurrency: z.number().int().positive().default(5),
  enable_media: z.boolean().default(false),
});
export type TaskCreate = z.infer<typeof taskCreateSchema>;

export const taskReadSchema = z.object({
  id: z.string(),
  platform: platformSchema,
  crawler_type: crawlerTypeSchema,
  keywords: z.string().nullable(),
  specified_urls: z.string().nullable(),
  creator_ids: z.string().nullable(),
  cookies: z.string().nullable(),
  proxy_url: z.string().nullable(),
  max_notes: z.number().int(),
  max_concurrency: z.number().int(),
  enable_media: z.number().int(),
  status: taskStatusSchema,
  progress: z.number().int().nullable(),
  total: z.number().int().nullable(),
  error: z.string().nullable(),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
  created_at: z.string(),
});
export type TaskRead = z.infer<typeof taskReadSchema>;

export const taskListItemSchema = taskReadSchema.pick({
  id: true,
  platform: true,
  crawler_type: true,
  keywords: true,
  status: true,
  progress: true,
  total: true,
  error: true,
  started_at: true,
  finished_at: true,
  created_at: true,
});
export type TaskListItem = z.infer<typeof taskListItemSchema>;

// ─── 内容 ────────────────────────────────────────────────────────
export const contentImageSchema = z.object({
  url: z.string(),
  width: z.number().optional(),
  height: z.number().optional(),
});

export const contentReadSchema = z.object({
  id: z.string(),
  platform: platformSchema,
  content_id: z.string(),
  title: z.string().nullable(),
  desc: z.string().nullable(),
  display_url: z.string().nullable(),
  images: z.string().nullable(),
  video_url: z.string().nullable(),
  video_cover_url: z.string().nullable(),
  author_id: z.string().nullable(),
  author_name: z.string().nullable(),
  author_avatar: z.string().nullable(),
  like_count: z.number().int().nullable(),
  collect_count: z.number().int().nullable(),
  comment_count: z.number().int().nullable(),
  share_count: z.number().int().nullable(),
  published_at: z.string().nullable(),
  crawled_at: z.string(),
  task_id: z.string().nullable(),
  tag: z.string().nullable(),
});
export type ContentRead = z.infer<typeof contentReadSchema>;

export const contentListItemSchema = contentReadSchema.pick({
  id: true,
  platform: true,
  content_id: true,
  title: true,
  desc: true,
  display_url: true,
  author_name: true,
  author_avatar: true,
  like_count: true,
  published_at: true,
  tag: true,
});
export type ContentListItem = z.infer<typeof contentListItemSchema>;

// ─── 创作者 ──────────────────────────────────────────────────────
export const creatorReadSchema = z.object({
  id: z.string(),
  platform: platformSchema,
  creator_id: z.string(),
  name: z.string().nullable(),
  avatar: z.string().nullable(),
  desc: z.string().nullable(),
  follower_count: z.number().int().nullable(),
  following_count: z.number().int().nullable(),
  note_count: z.number().int().nullable(),
  gender: z.string().nullable(),
  crawled_at: z.string(),
  task_id: z.string().nullable(),
});
export type CreatorRead = z.infer<typeof creatorReadSchema>;

export const creatorListItemSchema = creatorReadSchema.pick({
  id: true,
  platform: true,
  creator_id: true,
  name: true,
  avatar: true,
  follower_count: true,
  note_count: true,
});
export type CreatorListItem = z.infer<typeof creatorListItemSchema>;

// ─── 分页 ────────────────────────────────────────────────────────
export const paginationSchema = z.object({
  offset: z.number().int().nonnegative(),
  limit: z.number().int().positive().max(100),
  total: z.number().int().nonnegative(),
  has_more: z.boolean(),
});
export type Pagination = z.infer<typeof paginationSchema>;

export const paginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    data: z.array(itemSchema),
    pagination: paginationSchema,
  });
