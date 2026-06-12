import { apiFetch, backendApiPath } from "./client";

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

export function getLastActiveFeedMindThreadId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(activeThreadStorageKey);
}

export async function listChatSessions(): Promise<ChatSessionListItem[]> {
  return apiFetch<ChatSessionListItem[]>(backendApiPath("/chats"));
}

export async function deleteChatSessionApi(threadId: string): Promise<void> {
  await apiFetch<{ deleted: boolean }>(
    backendApiPath(`/chats/${encodeURIComponent(threadId)}`),
    { method: "DELETE" },
  );
}
