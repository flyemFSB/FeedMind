import type { RemoteThreadListAdapter } from "@assistant-ui/react";
import { createAgentThread } from "@/lib/api/agent";
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

const activeThreadStorageKey = "feedmind:active-thread";

function readActiveThreadId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(activeThreadStorageKey);
}

export function writeActiveFeedMindThreadId(threadId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(activeThreadStorageKey, threadId);
}

function clearActiveThreadId(threadId: string): void {
  if (typeof window === "undefined") return;
  if (window.localStorage.getItem(activeThreadStorageKey) === threadId) {
    window.localStorage.removeItem(activeThreadStorageKey);
  }
}

export async function listChatSessions(): Promise<ChatSessionListItem[]> {
  return apiFetch<ChatSessionListItem[]>(backendApiPath("/chats"));
}

// 删除会话，服务端已删除时仅清除本地 active thread ID
export async function deleteChatSession(threadId: string): Promise<void> {
  let found = true;
  try {
    await apiFetch<{ deleted: boolean }>(backendApiPath(`/chats/${encodeURIComponent(threadId)}`), { method: "DELETE" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("请求的资源不存在") || msg.includes("404")) { found = false; } else { throw err; }
  }
  if (!found) { clearActiveThreadId(threadId); return; }
  clearActiveThreadId(threadId);
}

export function createFeedMindThreadListAdapter(): RemoteThreadListAdapter {
  return {
    async list() {
      const sessions = await listChatSessions();
      return {
        threads: sessions.map((session) => ({
          remoteId: session.agent_thread_id, externalId: session.agent_thread_id,
          status: "regular" as const, title: session.title,
        })),
      };
    },
    async initialize() {
      const thread = await createAgentThread();
      writeActiveFeedMindThreadId(thread.thread_id);
      return { remoteId: thread.thread_id, externalId: thread.thread_id };
    },
    async fetch(threadId) {
      writeActiveFeedMindThreadId(threadId);
      return { remoteId: threadId, externalId: threadId, status: "regular" as const };
    },
    async delete(threadId) { await deleteChatSession(threadId); },
    async rename() { return undefined; },
    async archive() { return undefined; },
    async unarchive() { return undefined; },
    async generateTitle() { return new ReadableStream(); },
  };
}

export function getLastActiveFeedMindThreadId(): string | null {
  return readActiveThreadId();
}
