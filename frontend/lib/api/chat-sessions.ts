import type { RemoteThreadListAdapter } from "@assistant-ui/react";
import { createAegraThread } from "@/lib/api/aegra";

function emitToast(message: string, type: "error" | "info" | "success" = "error") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("feedmind:toast", { detail: { message, type } }),
  );
}

type ApiEnvelope<T> = {
  data: T | null;
  error?: {
    code: string;
    message: string;
  } | null;
};

export type ChatSessionListItem = {
  id: string;
  aegra_thread_id: string;
  title: string;
  pinned: boolean;
  message_count: number;
  last_message_at: string | null;
  updated_at: string;
};

const backendApiUrl =
  process.env.NEXT_PUBLIC_BACKEND_API_URL ?? "http://localhost:8000";

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

async function readEnvelope<T>(
  response: Response,
  fallbackMessage: string,
): Promise<T> {
  if (!response.ok) throw new Error(fallbackMessage);

  const envelope = (await response.json()) as ApiEnvelope<T>;
  if (envelope.error) throw new Error(envelope.error.message);
  if (envelope.data == null) throw new Error(fallbackMessage);

  return envelope.data;
}

export async function listChatSessions(): Promise<ChatSessionListItem[]> {
  const response = await fetch(`${backendApiUrl}/api/chat-sessions`);
  return readEnvelope(response, "加载历史会话失败");
}

export async function deleteChatSession(threadId: string): Promise<void> {
  const response = await fetch(
    `${backendApiUrl}/api/chat-sessions/${encodeURIComponent(threadId)}`,
    { method: "DELETE" },
  );
  if (response.status === 404) {
    clearActiveThreadId(threadId);
    return;
  }

  await readEnvelope(response, "删除历史会话失败");
  clearActiveThreadId(threadId);
}

export function createFeedMindThreadListAdapter(): RemoteThreadListAdapter {
  return {
    async list() {
      const sessions = await listChatSessions();

      return {
        threads: sessions.map((session) => ({
          remoteId: session.aegra_thread_id,
          externalId: session.aegra_thread_id,
          status: "regular",
          title: session.title,
        })),
      };
    },
    async initialize() {
      const thread = await createAegraThread();
      writeActiveFeedMindThreadId(thread.thread_id);

      return {
        remoteId: thread.thread_id,
        externalId: thread.thread_id,
      };
    },
    async fetch(threadId) {
      writeActiveFeedMindThreadId(threadId);

      return {
        remoteId: threadId,
        externalId: threadId,
        status: "regular",
      };
    },
    async delete(threadId) {
      await deleteChatSession(threadId);
    },
    async rename() {
      return undefined;
    },
    async archive() {
      return undefined;
    },
    async unarchive() {
      return undefined;
    },
    async generateTitle() {
      return new ReadableStream();
    },
  };
}

export function getLastActiveFeedMindThreadId(): string | null {
  return readActiveThreadId();
}
