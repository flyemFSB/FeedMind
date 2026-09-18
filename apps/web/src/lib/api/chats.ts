import { apiFetch, backendApiPath, apiPost, apiPatch } from "./client";
import type { UIMessage } from "@ai-sdk/react";

export type ChatSessionListItem = {
  id: string;
  agent_thread_id: string;
  title: string;
  pinned: boolean;
  updated_at: string;
};

export async function listChatSessions(): Promise<ChatSessionListItem[]> {
  return apiFetch<ChatSessionListItem[]>(backendApiPath("/chats"));
}

/** 读取会话消息（分页：page=0 为最新一页，递增向前翻更早的消息） */
export interface ChatMessagesPage {
  messages: UIMessage[];
  total: number;
  page: number;
  hasMore: boolean;
}

export async function getChatSessionMessages(
  threadId: string,
  page = 0,
  limit = 30,
): Promise<ChatMessagesPage> {
  return apiFetch<ChatMessagesPage>(
    backendApiPath(`/chats/${encodeURIComponent(threadId)}/messages?page=${page}&limit=${limit}`),
  );
}

export async function createChatSession(
  agentThreadId?: string,
  title?: string | null,
): Promise<{
  id: string;
  agent_thread_id: string;
  title: string;
}> {
  return apiPost("/chats", { agent_thread_id: agentThreadId, title });
}

/** 更新会话标题（按首条消息自动命名） */
export async function renameChatSession(
  threadId: string,
  title: string,
): Promise<ChatSessionListItem> {
  return apiPatch(`/chats/${encodeURIComponent(threadId)}`, { title });
}

export async function deleteChatSessionApi(threadId: string): Promise<void> {
  await apiFetch<{ deleted: boolean }>(backendApiPath(`/chats/${encodeURIComponent(threadId)}`), {
    method: "DELETE",
  });
}
