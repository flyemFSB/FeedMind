import { sql } from "drizzle-orm";
import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";

// ─── 远程连接配置 ──────────────────────────────────────────────
// Stores per-platform connection config: OAuth tokens, cookies, bot webhook.
export const remoteConnections = sqliteTable(
  "remote_connections",
  {
    id: text("id").primaryKey(),
    platform: text("platform").notNull(), // "feishu" | "xiaohongshu" | "douyin" | "bilibili" | "zhihu"
    label: text("label").notNull(), // user-visible name
    status: text("status").notNull().default("disconnected"), // "disconnected" | "connecting" | "connected" | "error"
    config: text("config"), // JSON: OAuth tokens / cookies / webhook config
    extra: text("extra"), // JSON: user info, platform-specific metadata
    error: text("error"), // last error message
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => ({
    platformIdx: index("idx_remote_conn_platform").on(table.platform),
    statusIdx: index("idx_remote_conn_status").on(table.status),
  }),
);

export type RemoteConnectionRow = typeof remoteConnections.$inferSelect;
export type RemoteConnectionInsert = typeof remoteConnections.$inferInsert;
