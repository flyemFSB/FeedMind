import { desc, eq } from "drizzle-orm";
import type { ChatSessionListItem, ChatSessionRead } from "@feedmind/contracts";
import { chatSessions, db, type ChatSessionRow } from "@feedmind/db";
import { toIsoString } from "@feedmind/shared";
import { HttpError } from "../../lib/http.js";

/** 创建新会话；未指定 threadId 时自动生成 UUID */
export async function createChatSession(
  agentThreadId?: string,
  title?: string | null,
): Promise<ChatSessionRead> {
  const id = agentThreadId ?? crypto.randomUUID();
  const [row] = await db
    .insert(chatSessions)
    .values({
      agentThreadId: id,
      title: title?.trim() ?? "新会话",
    })
    .returning();
  return toRead(row);
}

function toRead(row: ChatSessionRow): ChatSessionRead {
  return {
    id: row.id,
    agent_thread_id: row.agentThreadId,
    title: row.title,
    message_count: row.messageCount,
    last_message_at: toIsoString(row.lastMessageAt),
  };
}

function toListItem(row: ChatSessionRow): ChatSessionListItem {
  return {
    ...toRead(row),
    pinned: row.pinned,
    updated_at: toIsoString(row.updatedAt) ?? new Date(0).toISOString(),
  };
}

export async function listChatSessions(): Promise<ChatSessionListItem[]> {
  const rows = await db
    .select()
    .from(chatSessions)
    .orderBy(desc(chatSessions.pinned), desc(chatSessions.updatedAt));
  return rows.map(toListItem);
}

export async function getChatSession(agentThreadId: string): Promise<ChatSessionRead> {
  const [row] = await db
    .select()
    .from(chatSessions)
    .where(eq(chatSessions.agentThreadId, agentThreadId))
    .limit(1);
  if (!row) throw new HttpError(404, "HTTP_ERROR", "会话不存在");
  return toRead(row);
}

/** 更新会话标题（按首条消息自动命名） */
export async function updateChatSessionTitle(
  agentThreadId: string,
  title: string,
): Promise<ChatSessionRead> {
  const [row] = await db
    .update(chatSessions)
    .set({ title: title.trim(), updatedAt: new Date().toISOString() })
    .where(eq(chatSessions.agentThreadId, agentThreadId))
    .returning();
  if (!row) throw new HttpError(404, "HTTP_ERROR", "会话不存在");
  return toRead(row);
}

export async function deleteChatSession(agentThreadId: string): Promise<ChatSessionRead> {
  const [row] = await db
    .delete(chatSessions)
    .where(eq(chatSessions.agentThreadId, agentThreadId))
    .returning();
  if (!row) throw new HttpError(404, "HTTP_ERROR", "会话不存在");
  return toRead(row);
}
