import { sql } from "drizzle-orm";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const rssSources = sqliteTable("rss_sources", {
  id: text("id").primaryKey(),
  type: text("type", { enum: ["rss", "social"] }).notNull(),
  platform: text("platform"),
  route: text("route"),
  url: text("url").notNull(),
  title: text("title").notNull(),
  params: text("params"),
  lastSyncedAt: text("last_synced_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

export type RssSourceRow = typeof rssSources.$inferSelect;
