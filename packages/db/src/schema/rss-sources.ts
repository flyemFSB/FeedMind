import { sql } from "drizzle-orm";
import { check, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const rssSources = sqliteTable(
  "rss_sources",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    platform: text("platform"),
    route: text("route"),
    url: text("url").notNull(),
    title: text("title").notNull(),
    params: text("params"), // JSON
    lastSyncedAt: text("last_synced_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  () => ({
    typeCheck: check("ck_rss_sources_type", sql`type IN ('rss', 'social')`),
  }),
);

export type RssSourceRow = typeof rssSources.$inferSelect;
