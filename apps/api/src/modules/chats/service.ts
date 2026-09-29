import { toAISdkV5Messages } from "@mastra/ai-sdk/ui";
import { LOCAL_RESOURCE_ID } from "@feedmind/contracts";
import type { ChatSessionListItem, ChatSessionRead } from "@feedmind/contracts";
import { HttpError } from "../../lib/http.js";
import { feedmindAgent } from "../../mastra/agents/feedmind-agent.js";
import { mergeAssistantTurns } from "./history.js";

/**
 * 会话即 Mastra 线程：标题与置顶存线程本身，增删改一律走 memory 公开 API，
 * 避免「应用侧镜像行 + mastra 侧线程」双写漂移与删除残留。
 */

async function getMemory() {
  const memory = await feedmindAgent.getMemory();
  if (!memory) throw new HttpError(500, "MEMORY_UNAVAILABLE", "记忆模块不可用");
  return memory;
}

interface ThreadLike {
  id: string;
  title?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
  updatedAt: Date | string;
}

function pinnedOf(metadata: Record<string, unknown> | undefined): boolean {
  return Boolean(metadata?.["pinned"]);
}

function toRead(thread: ThreadLike): ChatSessionRead {
  return {
    id: thread.id,
    agent_thread_id: thread.id,
    title: thread.title?.trim() || "新会话",
    metadata: thread.metadata,
  };
}

export async function listChatSessions(): Promise<ChatSessionListItem[]> {
  const memory = await getMemory();
  const { threads } = await memory.listThreads({
    filter: { resourceId: LOCAL_RESOURCE_ID },
    perPage: false,
  });

  return (threads as ThreadLike[])
    .map((thread) => ({
      ...toRead(thread),
      pinned: pinnedOf(thread.metadata),
      updated_at: new Date(thread.updatedAt).toISOString(),
    }))
    .sort(
      (a, b) => Number(b.pinned) - Number(a.pinned) || b.updated_at.localeCompare(a.updated_at),
    );
}

/** 新建会话：显式建线程，空会话也能立即出现在列表里 */
export async function createChatSession(
  agentThreadId?: string,
  title?: string | null,
): Promise<ChatSessionRead> {
  const memory = await getMemory();
  const thread = await memory.createThread({
    threadId: agentThreadId ?? crypto.randomUUID(),
    resourceId: LOCAL_RESOURCE_ID,
    title: title?.trim() || "新会话",
    metadata: { pinned: false },
  });
  return toRead(thread as ThreadLike);
}

export async function getChatSession(agentThreadId: string): Promise<ChatSessionRead> {
  const memory = await getMemory();
  const thread = await memory.getThreadById({ threadId: agentThreadId });
  if (!thread)
    throw new HttpError(404, "HTTP_ERROR", "会话不存在", {}, { i18nKey: "apiError.chatNotFound" });
  return toRead(thread as ThreadLike);
}

/** 更新会话标题（按首条消息自动命名） */
export async function updateChatSessionTitle(
  agentThreadId: string,
  title: string,
): Promise<ChatSessionRead> {
  await getChatSession(agentThreadId);
  const memory = await getMemory();
  const thread = await memory.updateThread({ id: agentThreadId, title: title.trim() });
  return toRead(thread as ThreadLike);
}

/** 删除会话：Mastra 负责级联清理消息、观察记忆与向量 */
export async function deleteChatSession(agentThreadId: string): Promise<ChatSessionRead> {
  const session = await getChatSession(agentThreadId);
  const memory = await getMemory();
  await memory.deleteThread(agentThreadId);
  return session;
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
