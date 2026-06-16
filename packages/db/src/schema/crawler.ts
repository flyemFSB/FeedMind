import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// ─── 爬虫任务 ───────────────────────────────────────────────────
// Each row represents an async crawl task that produces an RSS 2.0 XML output.
export const crawlerTasks = sqliteTable(
  "crawler_tasks",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    route: text("route").notNull(),
    params: text("params").notNull(),
    cookies: text("cookies"),
    proxyUrl: text("proxy_url"),
    maxItems: integer("max_items").notNull().default(50),
    status: text("status").notNull().default("queued"),
    progress: integer("progress"),
    error: text("error"),
    rssOutput: text("rss_output"),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => ({
    routeStatusIdx: index("idx_crawler_tasks_route_status").on(table.route, table.status),
    createdAtIdx: index("idx_crawler_tasks_created_at").on(table.createdAt),
    statusIdx: index("idx_crawler_tasks_status").on(table.status),
  }),
);

// ─── 类型 ────────────────────────────────────────────────────────
export type CrawlerTaskRow = typeof crawlerTasks.$inferSelect;
export type CrawlerTaskInsert = typeof crawlerTasks.$inferInsert;
