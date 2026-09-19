import { sql } from "drizzle-orm";
import { check, index, sqliteTable, text } from "drizzle-orm/sqlite-core";

// 远程平台连接配置表：各平台保持唯一记录，敏感配置由应用层加密存储
export const remoteConnections = sqliteTable(
  "remote_connections",
  {
    id: text("id").primaryKey(),
    platform: text("platform").notNull().unique(),
    label: text("label").notNull(),
    status: text("status").notNull().default("disconnected"),
    config: text("config"), // 配置详情 JSON 字符串，敏感字段经应用层加密
    extra: text("extra"), // 平台非敏感公开元数据 JSON 字符串
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
