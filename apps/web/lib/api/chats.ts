import { apiFetch, backendApiPath, apiPost, apiPatch } from "./client";
import type { UIMessage } from "@ai-sdk/react";

export type ChatSessionListItem = {
  id: string;
  agent_thread_id: string;
  title: string;
  pinned: boolean;
  message_count: number;
  last_message_at: string | null;
  updated_at: string;
};

/** Query key factory for chat sessions */
export const chatKeys = {
  all: ["chats"] as const,
  list: () => [...chatKeys.all, "list"] as const,
};

const activeThreadStorageKey = "feedmind:active-thread";

export function writeActiveFeedMindThreadId(threadId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(activeThreadStorageKey, threadId);
}

export function readActiveFeedMindThreadId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(activeThreadStorageKey);
}

export function clearActiveFeedMindThreadId(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(activeThreadStorageKey);
}

export async function listChatSessions(): Promise<ChatSessionListItem[]> {
  return apiFetch<ChatSessionListItem[]>(backendApiPath("/chats"));
}

/** 读取会话消息 */
export async function getChatSessionMessages(threadId: string): Promise<UIMessage[]> {
  return apiFetch<UIMessage[]>(backendApiPath(`/chats/${encodeURIComponent(threadId)}/messages`));
}

/** 创建新会话 */
export async function createChatSession(
  agentThreadId?: string,
  title?: string | null,
): Promise<{
  id: string;
  agent_thread_id: string;
  title: string;
  message_count: number;
  last_message_at: string | null;
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
