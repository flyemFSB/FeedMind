import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { rssSources } from "./rss-sources.ts";

export const feeds = sqliteTable(
  "feeds",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id")
      .notNull()
      .references(() => rssSources.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    link: text("link"),
    guid: text("guid").notNull(),
    author: text("author"),
    /** JSON 数组字符串，如 `["科技","AI"]`；非单一分类标量 */
    category: text("category"),
    image: text("image"),
    pubDate: text("pub_date"),
    fetchedAt: text("fetched_at").notNull(),
    isRead: integer("is_read", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (table) => ({
    sourceGuidIdx: uniqueIndex("idx_feeds_source_guid").on(table.sourceId, table.guid),
    pubDateIdx: index("idx_feeds_pub_date").on(table.pubDate),
    sourceReadIdx: index("idx_feeds_source_is_read").on(table.sourceId, table.isRead),
  }),
);

export type FeedRow = typeof feeds.$inferSelect;
