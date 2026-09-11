import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// 爬虫任务：每行一个异步爬取任务，产出 RSS 2.0 XML。
export const crawlerTasks = sqliteTable(
  "crawler_tasks",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    route: text("route").notNull(),
    params: text("params").notNull(), // JSON
    cookies: text("cookies"),
    maxItems: integer("max_items").notNull().default(50),
    status: text("status").notNull().default("queued"),
    error: text("error"),
    rssOutput: text("rss_output"),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (table) => ({
    routeStatusIdx: index("idx_crawler_tasks_route_status").on(table.route, table.status),
    createdAtIdx: index("idx_crawler_tasks_created_at").on(table.createdAt),
    statusIdx: index("idx_crawler_tasks_status").on(table.status),
    statusCheck: check(
      "ck_crawler_tasks_status",
      sql`status IN ('queued', 'running', 'completed', 'failed', 'cancelled')`,
    ),
  }),
);

export type CrawlerTaskRow = typeof crawlerTasks.$inferSelect;
