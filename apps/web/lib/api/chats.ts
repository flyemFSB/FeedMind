import { apiFetch, backendApiPath, apiPut, apiPost } from "./client";

export type ChatSessionListItem = {
  id: string;
  agent_thread_id: string;
  title: string;
  pinned: boolean;
  message_count: number;
  last_message_at: string | null;
  updated_at: string;
};

export type ChatMessageRead = {
  id: string;
  session_id: string;
  agent_message_id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  status: "streaming" | "completed" | "failed";
  model: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ChatMessageSnapshot = {
  agent_message_id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  status?: "streaming" | "completed" | "failed";
  model?: string;
  metadata?: Record<string, unknown>;
};

export type ChatSessionSnapshot = {
  title?: string | null;
  messages: ChatMessageSnapshot[];
};

/** Query key factory for chat sessions */
export const chatKeys = {
  all: ["chats"] as const,
  list: () => [...chatKeys.all, "list"] as const,
  messages: (threadId: string) => [...chatKeys.all, "messages", threadId] as const,
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

/** 读取会话消息记录 */
export async function getChatSessionMessages(threadId: string): Promise<ChatMessageRead[]> {
  return apiFetch<ChatMessageRead[]>(
    backendApiPath(`/chats/${encodeURIComponent(threadId)}/messages`),
  );
}

/** 保存会话快照（幂等 upsert） */
export async function saveChatSession(threadId: string, payload: ChatSessionSnapshot): Promise<void> {
  await apiPut(`/chats/${encodeURIComponent(threadId)}`, payload);
}

/** 创建新会话 */
export async function createChatSession(agentThreadId?: string, title?: string | null): Promise<{ id: string; agent_thread_id: string; title: string; message_count: number; last_message_at: string | null }> {
  return apiPost("/chats", { agent_thread_id: agentThreadId, title });
}

export async function deleteChatSessionApi(threadId: string): Promise<void> {
  await apiFetch<{ deleted: boolean }>(
    backendApiPath(`/chats/${encodeURIComponent(threadId)}`),
    { method: "DELETE" },
  );
}
