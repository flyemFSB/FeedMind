import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  json,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

// 会话表：包含置顶排序和更新时间索引，支持会话列表按 pinned + updatedAt 排序
export const chatSessions = pgTable(
  "chat_sessions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    agentThreadId: text("agent_thread_id").notNull().unique(),
    title: text("title").notNull().default("新会话"),
    pinned: boolean("pinned").notNull().default(false),
    messageCount: integer("message_count").notNull().default(0),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    updatedAtIdx: index("idx_chat_sessions_updated_at").on(table.updatedAt),
    pinnedUpdatedAtIdx: index("idx_chat_sessions_pinned_updated_at").on(
      table.pinned,
      table.updatedAt,
    ),
  }),
);

// 消息表：agent_message_id + session_id 构成唯一约束支持幂等 upsert；级联删除随会话清除
export const chatMessages = pgTable(
  "chat_messages",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    sessionId: text("session_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    agentMessageId: text("agent_message_id").notNull(),
    role: text("role").notNull(),
    content: text("content").notNull(),
    status: text("status").notNull().default("completed"),
    model: text("model").notNull().default(""),
    metadata: json("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::json`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    roleCheck: check("ck_chat_messages_role", sql`${table.role} in ('user', 'assistant', 'system', 'tool')`),
    statusCheck: check(
      "ck_chat_messages_status",
      sql`${table.status} in ('streaming', 'completed', 'failed')`,
    ),
    sessionAgentIdUq: unique("uq_chat_messages_session_agent_id").on(
      table.sessionId,
      table.agentMessageId,
    ),
    sessionCreatedAtIdx: index("idx_chat_messages_session_created_at").on(
      table.sessionId,
      table.createdAt,
    ),
  }),
);

export type ChatSessionRow = typeof chatSessions.$inferSelect;
export type ChatSessionInsert = typeof chatSessions.$inferInsert;
export type ChatMessageRow = typeof chatMessages.$inferSelect;
export type ChatMessageInsert = typeof chatMessages.$inferInsert;
