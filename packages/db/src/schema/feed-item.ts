import { sql } from "drizzle-orm";
import { check, index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { source } from "./source.ts";

// 订阅条目：source 级联删除；同一来源按 guid 去重
export const feedItem = sqliteTable(
  "feed_item",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id")
      .notNull()
      .references(() => source.id, { onDelete: "cascade" }),
    guid: text("guid").notNull(),
    title: text("title").notNull(),
    summary: text("summary"),
    url: text("url"),
    author: text("author"),
    tags: text("tags", { mode: "json" }).$type<string[]>(),
    image: text("image"),
    publishedAt: text("published_at"),
    readAt: text("read_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (t) => [
    check("ck_feed_item_tags", sql`tags IS NULL OR json_valid(tags)`),
    uniqueIndex("uq_feed_item_guid").on(t.sourceId, t.guid),
    // 列表排序索引含 coalesce 表达式，drizzle-kit 无法生成，声明在 raw-ddl.sql
    index("idx_feed_item_unread")
      .on(t.sourceId)
      .where(sql`read_at IS NULL`),
  ],
);

export type FeedItemRow = typeof feedItem.$inferSelect;
export type FeedItemInsert = typeof feedItem.$inferInsert;
