import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";

export const feeds = sqliteTable(
  "feeds",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    link: text("link"),
    guid: text("guid").notNull(),
    author: text("author"),
    category: text("category"),
    image: text("image"),
    pubDate: text("pub_date"),
    fetchedAt: text("fetched_at").notNull(),
    isRead: integer("is_read").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => ({
    sourceGuidIdx: uniqueIndex("idx_feeds_source_guid").on(table.sourceId, table.guid),
  }),
);

export type FeedRow = typeof feeds.$inferSelect;
