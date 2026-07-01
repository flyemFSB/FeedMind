import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// 会话表：包含置顶排序和更新时间索引，支持会话列表按 pinned + updatedAt 排序
export const chatSessions = sqliteTable(
  "chat_sessions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    agentThreadId: text("agent_thread_id").notNull().unique(),
    title: text("title").notNull().default("新会话"),
    pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
    messageCount: integer("message_count").notNull().default(0),
    lastMessageAt: text("last_message_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
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
export type ChatSessionInsert = typeof chatSessions.$inferInsert;
