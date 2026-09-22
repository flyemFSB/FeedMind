import { desc, eq } from "drizzle-orm";
import { toAISdkV5Messages } from "@mastra/ai-sdk/ui";
import type { ChatSessionListItem, ChatSessionRead } from "@feedmind/contracts";
import { chatSessions, db, type ChatSessionRow } from "@feedmind/db";
import { HttpError } from "../../lib/http.js";
import { feedmindAgent } from "../../mastra/agents/feedmind-agent.js";
import { mergeAssistantTurns } from "./history.js";

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
  return toRead(row!);
}

function toRead(row: ChatSessionRow): ChatSessionRead {
  return {
    id: row.id,
    agent_thread_id: row.agentThreadId,
    title: row.title,
  };
}

function toListItem(row: ChatSessionRow): ChatSessionListItem {
  return {
    ...toRead(row),
    pinned: row.pinned,
    updated_at: row.updatedAt,
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
  if (!row)
    throw new HttpError(404, "HTTP_ERROR", "会话不存在", {}, { i18nKey: "apiError.chatNotFound" });
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
  if (!row)
    throw new HttpError(404, "HTTP_ERROR", "会话不存在", {}, { i18nKey: "apiError.chatNotFound" });
  return toRead(row);
}

export async function deleteChatSession(agentThreadId: string): Promise<ChatSessionRead> {
  const [row] = await db
    .delete(chatSessions)
    .where(eq(chatSessions.agentThreadId, agentThreadId))
    .returning();
  if (!row)
    throw new HttpError(404, "HTTP_ERROR", "会话不存在", {}, { i18nKey: "apiError.chatNotFound" });
  return toRead(row);
}

/** 完整读取会话消息，避免分页切片导致观察记忆过滤后窗口错位 */
export async function getChatSessionMessages(
  threadId: string,
): Promise<ReturnType<typeof toAISdkV5Messages>> {
  const memory = await feedmindAgent.getMemory();
  if (!memory) return [];
  const { messages } = await memory.recall({ threadId, perPage: false });
  return mergeAssistantTurns(toAISdkV5Messages(messages));
}
