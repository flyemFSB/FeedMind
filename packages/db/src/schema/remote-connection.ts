import { sql } from "drizzle-orm";
import { check, index, sqliteTable, text } from "drizzle-orm/sqlite-core";

// 远程连接配置：OAuth token / cookie / webhook 等；config 为 JSON，敏感段应用层加密。
// 业务为「每平台至多一条」，platform 唯一。
export const remoteConnections = sqliteTable(
  "remote_connections",
  {
    id: text("id").primaryKey(),
    platform: text("platform").notNull().unique(),
    label: text("label").notNull(),
    status: text("status").notNull().default("disconnected"),
    config: text("config"), // JSON 字符串；应用层 Fernet 加密后写入
    extra: text("extra"), // JSON 元数据（明文）
    error: text("error"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (table) => ({
    statusIdx: index("idx_remote_conn_status").on(table.status),
    statusCheck: check(
      "ck_remote_connections_status",
      sql`status IN ('disconnected', 'connecting', 'connected', 'error')`,
    ),
  }),
);

export type RemoteConnectionRow = typeof remoteConnections.$inferSelect;
