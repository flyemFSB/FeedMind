import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";

// ─── Crawler Task ─────────────────────────────────────────────────
export const crawlerTasks = sqliteTable(
  "crawler_tasks",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    platform: text("platform").notNull(),
    crawlerType: text("crawler_type").notNull(),
    keywords: text("keywords"),
    specifiedUrls: text("specified_urls"),
    creatorIds: text("creator_ids"),
    cookies: text("cookies"),
    proxyUrl: text("proxy_url"),
    maxNotes: integer("max_notes").notNull().default(100),
    maxConcurrency: integer("max_concurrency").notNull().default(5),
    enableMedia: integer("enable_media").notNull().default(0),
    status: text("status").notNull().default("queued"),
    progress: integer("progress").default(0),
    total: integer("total").default(0),
    error: text("error"),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  },
  (table) => ({
    platformStatusIdx: index("idx_crawler_tasks_platform_status").on(
      table.platform,
      table.status,
    ),
    createdAtIdx: index("idx_crawler_tasks_created_at").on(table.createdAt),
    statusIdx: index("idx_crawler_tasks_status").on(table.status),
  }),
);

// ─── Crawler Content ──────────────────────────────────────────────
export const crawlerContents = sqliteTable(
  "crawler_contents",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    platform: text("platform").notNull(),
    contentId: text("content_id").notNull(),
    title: text("title"),
    desc: text("desc"),
    displayUrl: text("display_url"),
    images: text("images"),
    videoUrl: text("video_url"),
    videoCoverUrl: text("video_cover_url"),
    authorId: text("author_id"),
    authorName: text("author_name"),
    authorAvatar: text("author_avatar"),
    likeCount: integer("like_count"),
    collectCount: integer("collect_count"),
    commentCount: integer("comment_count"),
    shareCount: integer("share_count"),
    publishedAt: text("published_at"),
    crawledAt: text("crawled_at").notNull().default(sql`(current_timestamp)`),
    taskId: text("task_id"),
    rawJson: text("raw_json"),
    tag: text("tag"),
  },
  (table) => ({
    contentPlatformUq: unique("uq_crawler_contents_platform_id").on(
      table.contentId,
      table.platform,
    ),
    platformIdx: index("idx_crawler_contents_platform").on(table.platform),
    taskIdIdx: index("idx_crawler_contents_task_id").on(table.taskId),
    authorIdIdx: index("idx_crawler_contents_author_id").on(table.authorId),
    tagIdx: index("idx_crawler_contents_tag").on(table.tag),
  }),
);

// ─── Crawler Creator ──────────────────────────────────────────────
export const crawlerCreators = sqliteTable(
  "crawler_creators",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    platform: text("platform").notNull(),
    creatorId: text("creator_id").notNull(),
    name: text("name"),
    avatar: text("avatar"),
    desc: text("desc"),
    followerCount: integer("follower_count"),
    followingCount: integer("following_count"),
    noteCount: integer("note_count"),
    gender: text("gender"),
    crawledAt: text("crawled_at").notNull().default(sql`(current_timestamp)`),
    taskId: text("task_id"),
    rawJson: text("raw_json"),
  },
  (table) => ({
    creatorPlatformUq: unique("uq_crawler_creators_platform_id").on(
      table.creatorId,
      table.platform,
    ),
    platformIdx: index("idx_crawler_creators_platform").on(table.platform),
    taskIdIdx: index("idx_crawler_creators_task_id").on(table.taskId),
  }),
);

// ─── Types ────────────────────────────────────────────────────────
export type CrawlerTaskRow = typeof crawlerTasks.$inferSelect;
export type CrawlerTaskInsert = typeof crawlerTasks.$inferInsert;
export type CrawlerContentRow = typeof crawlerContents.$inferSelect;
export type CrawlerContentInsert = typeof crawlerContents.$inferInsert;
export type CrawlerCreatorRow = typeof crawlerCreators.$inferSelect;
export type CrawlerCreatorInsert = typeof crawlerCreators.$inferInsert;
