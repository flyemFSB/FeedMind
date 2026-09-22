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

/** 读取会话全部历史消息 */
export async function getChatSessionMessages(threadId: string): Promise<UIMessage[]> {
  return apiFetch<UIMessage[]>(backendApiPath(`/chats/${encodeURIComponent(threadId)}/messages`));
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
