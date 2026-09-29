import { sql } from "drizzle-orm";
import { check, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// 订阅源：kind 决定形态——外部 RSS 地址，或平台路由（route + params）
export const source = sqliteTable(
  "source",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    url: text("url"),
    platform: text("platform"),
    route: text("route"),
    params: text("params", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (t) => [
    check("ck_source_kind", sql`kind IN ('rss', 'social')`),
    check("ck_source_params", sql`params IS NULL OR json_valid(params)`),
    check(
      "ck_source_shape",
      sql`(kind = 'rss' AND url IS NOT NULL) OR (kind = 'social' AND route IS NOT NULL AND platform IS NOT NULL)`,
    ),
    uniqueIndex("uq_source_url")
      .on(t.url)
      .where(sql`kind = 'rss'`),
  ],
);

export type SourceRow = typeof source.$inferSelect;
export type SourceInsert = typeof source.$inferInsert;
