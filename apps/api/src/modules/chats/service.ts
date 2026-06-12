import { and, count, desc, eq, ne } from "drizzle-orm";
import type {
  ChatMessageSnapshot,
  ChatSessionListItem,
  ChatSessionRead,
  ChatSessionSnapshot,
} from "@feedmind/contracts";
import { chatMessages, chatSessions, db, type ChatMessageRow, type ChatSessionRow } from "@feedmind/db";
import { toIsoString } from "@feedmind/shared";
import { HttpError } from "../../lib/http.js";

/** 创建新会话；未指定 threadId 时自动生成 UUID */
export async function createChatSession(
  agentThreadId?: string,
  title?: string | null,
): Promise<ChatSessionRead> {
  const id = agentThreadId || crypto.randomUUID();
  const [row] = await db
    .insert(chatSessions)
    .values({
      agentThreadId: id,
      title: title?.trim() || "新会话",
    })
    .returning();
  return toRead(row);
}

// 取首条用户消息前 30 字符作为默认会话标题
function defaultTitle(payload: ChatSessionSnapshot): string {
  return payload.messages.find((message) => message.role === "user")?.content.trim().slice(0, 30) || "新会话";
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

// 标记被新分支取代的消息为 inactive，保留历史分支数据而不删除
function mergeInactiveMetadata(row: ChatMessageRow, inactiveAt: string): string {
  const metadata = (() => {
    try { return row.metadata ? JSON.parse(row.metadata) : {}; } catch { return {}; }
  })() as Record<string, unknown>;
  return JSON.stringify({ ...metadata, branch_status: "inactive", inactive_at: inactiveAt });
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

async function upsertMessage(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  sessionId: string,
  message: ChatMessageSnapshot,
  existing?: ChatMessageRow,
): Promise<void> {
  const values = {
    role: message.role,
    content: message.content,
    status: message.status,
    model: message.model,
    metadata: JSON.stringify(message.metadata ?? {}),
    updatedAt: new Date().toISOString(),
  };

  if (existing) {
    await tx.update(chatMessages).set(values).where(eq(chatMessages.id, existing.id));
    return;
  }

  await tx.insert(chatMessages).values({
    sessionId,
    agentMessageId: message.agent_message_id,
    ...values,
  });
}

// 保存会话快照：事务内 upsert 消息 + 标记已删除分支为 inactive + 校正 message_count
export async function saveChatSession(
  agentThreadId: string,
  payload: ChatSessionSnapshot,
): Promise<ChatSessionRead> {
  const now = new Date().toISOString();

  return db.transaction(async (tx) => {
    let [session] = await tx
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.agentThreadId, agentThreadId))
      .limit(1);

    if (!session) {
      [session] = await tx.insert(chatSessions).values({ agentThreadId }).returning();
    }

    const title = payload.title?.trim() || defaultTitle(payload);
    const [updatedSession] = await tx
      .update(chatSessions)
      .set({
        title,
        messageCount: payload.messages.length,
        lastMessageAt: payload.messages.length ? now : null,
        updatedAt: now,
      })
      .where(eq(chatSessions.id, session.id))
      .returning();

    const existingMessages = await tx
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, session.id));
    // 以 agent_message_id 为键做 upsert，幂等保存
    const existingByAgentId = new Map(existingMessages.map((message) => [message.agentMessageId, message]));
    const incomingIds = new Set(payload.messages.map((message) => message.agent_message_id));

    for (const message of payload.messages) {
      await upsertMessage(tx, session.id, message, existingByAgentId.get(message.agent_message_id));
    }

    // 标记被新分支取代的消息，保留历史数据用于分支切换回滚
    const inactiveAt = now;
    for (const message of existingMessages) {
      if (incomingIds.has(message.agentMessageId)) continue;
      await tx
        .update(chatMessages)
        .set({
          status: "failed",
          metadata: mergeInactiveMetadata(message, inactiveAt),
          updatedAt: now,
        })
        .where(eq(chatMessages.id, message.id));
    }

    // 重新计算活跃消息数，排除标记为 failed 的分支
    const [activeCount] = await tx
      .select({ value: count() })
      .from(chatMessages)
      .where(and(eq(chatMessages.sessionId, session.id), ne(chatMessages.status, "failed")));

    const [finalSession] = await tx
      .update(chatSessions)
      .set({ messageCount: activeCount?.value ?? updatedSession.messageCount, updatedAt: now })
      .where(eq(chatSessions.id, session.id))
      .returning();

    return toRead(finalSession);
  });
}

export async function deleteChatSession(agentThreadId: string): Promise<ChatSessionRead> {
  const [row] = await db
    .delete(chatSessions)
    .where(eq(chatSessions.agentThreadId, agentThreadId))
    .returning();
  if (!row) throw new HttpError(404, "HTTP_ERROR", "会话不存在");
  return toRead(row);
}
