import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// 会话表：消息本体在 Mastra Memory，本表只做列表元数据。
// 早期 message_count / last_message_at 从未回写（死字段），已删除。
export const chatSessions = sqliteTable(
  "chat_sessions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    agentThreadId: text("agent_thread_id").notNull().unique(),
    title: text("title").notNull().default("新会话"),
    pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (table) => ({
    updatedAtIdx: index("idx_chat_sessions_updated_at").on(table.updatedAt),
    pinnedUpdatedAtIdx: index("idx_chat_sessions_pinned_updated_at").on(
      table.pinned,
      table.updatedAt,
    ),
  }),
);

export type ChatSessionRow = typeof chatSessions.$inferSelect;
