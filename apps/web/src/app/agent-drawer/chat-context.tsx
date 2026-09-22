/**
 * ChatContext — 聊天运行时上下文
 * 使用 @ai-sdk/react 的 useChat hook 与 Mastra 后端通信
 * 消息持久化由 Agent Memory 自动处理
 */

import {
  createContext,
  useContext,
  useMemo,
  useEffect,
  useRef,
  useCallback,
  useState,
  type Context,
  type ReactNode,
} from "react";
import { useChat, type UIMessage } from "@ai-sdk/react";
import { useQueryClient } from "@tanstack/react-query";
import { DefaultChatTransport, type FileUIPart } from "ai";
import { getSelectedFeedMindModel } from "@/lib/api/agent";
import { getChatSessionMessages, createChatSession, renameChatSession } from "@/lib/api/chats";
import { chatOptions } from "@/lib/hooks/use-chats";
import { makeChatTitle } from "@/app/agent-drawer/chat-utils";

import { getCurrentWorkspaceContext } from "@/app/shell/app-shell-context";

/** Mastra Chat 路由地址（通过 SSR proxy 转发到 API 服务） */
const CHAT_API = "/api/chat/feedmind";

export interface RetryStatus {
  attempt: number;
  maxAttempts: number;
  /** 该次重试的等待秒数（取自重试帧，不逐秒递减） */
  delaySec: number;
}

export interface ChatContextValue {
  messages: UIMessage[];
  sendMessage: (data: { text: string; files?: FileUIPart[] }) => Promise<void>;
  status: ReturnType<typeof useChat>["status"];
  retryStatus: RetryStatus | null;
  stop: () => Promise<void>;
  regenerate: () => Promise<void>;
  error: Error | undefined;
  clearError: () => void;
  setMessages: (messages: UIMessage[] | ((messages: UIMessage[]) => UIMessage[])) => void;
  activeThreadId: string | null;
  isLoadingHistory: boolean;
  switchSession: (threadId: string) => Promise<void>;
  createNewSession: () => Promise<void>;
  clearSession: () => void;
}

// context 单例挂在 globalThis：模块被重复求值（HMR / 重复 chunk）时仍共享同一实例，
// 否则 Provider 与 useChatContext 各持一个 context，树完全正确也会报「must be used within ChatProvider」
const chatContextRegistry = globalThis as typeof globalThis & {
  __feedmindChatContext?: Context<ChatContextValue | null>;
};
const ChatContext = (chatContextRegistry.__feedmindChatContext ??=
  createContext<ChatContextValue | null>(null));

/**
 * ChatProvider — 提供 useChat 上下文给所有子组件
 */
export function ChatProvider({ children }: { children: ReactNode }) {
  // 每次进入系统默认新对话：不从 localStorage 恢复上次会话，避免首帧加载残留 threadId 导致空对话
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const queryClient = useQueryClient();

  const activeThreadIdRef = useRef<string | null>(activeThreadId);
  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  // ── Transport：传 memory.thread 给 chatRoute，Memory 自动管理历史 ──
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: CHAT_API,
        headers: {} as Record<string, string>,
        prepareSendMessagesRequest({ messages }) {
          const threadId = activeThreadIdRef.current;
          const feedmindModelId = getSelectedFeedMindModel();
          const wsContext = getCurrentWorkspaceContext();
          return {
            body: {
              messages,
              ...(threadId ? { memory: { thread: threadId, resource: threadId } } : {}),
            },
            headers: {
              ...(feedmindModelId ? { "x-feedmind-model-id": feedmindModelId } : {}),
              ...(wsContext
                ? { "x-feedmind-context": encodeURIComponent(JSON.stringify(wsContext)) }
                : {}),
            } as Record<string, string>,
          };
        },
      }),
    [],
  );

  const [retryStatus, setRetryStatus] = useState<RetryStatus | null>(null);

  // ── useChat 聊天会话状态 Hook ──
  const {
    messages,
    setMessages: setUiMessages,
    sendMessage: rawSendMessage,
    status,
    stop: rawStop,
    regenerate: rawRegenerate,
    error,
    clearError,
  } = useChat({
    transport,
    onData: (dataPart) => {
      if (
        dataPart.type === "data-retry" &&
        typeof dataPart.data === "object" &&
        dataPart.data !== null
      ) {
        const info = dataPart.data as {
          attempt?: number;
          maxAttempts?: number;
          delaySec?: number;
        };
        setRetryStatus({
          attempt: info.attempt ?? 1,
          maxAttempts: info.maxAttempts ?? 3,
          delaySec: info.delaySec ?? 1,
        });
      }
    },
    onFinish: () => {
      setRetryStatus(null);
    },
    onError: (error) => {
      setRetryStatus(null);
      console.error("[会话] 流式响应接收异常:", error);
    },
  });

  const stop = useCallback(async () => {
    setRetryStatus(null);
    await rawStop();
  }, [rawStop]);

  const regenerate = useCallback(async () => {
    setRetryStatus(null);
    await rawRegenerate();
  }, [rawRegenerate]);

  // ── 消息加载（从 Memory API 读取整段历史） ──
  const loadSessionMessages = useCallback(
    async (threadId: string) => {
      setIsLoadingHistory(true);
      try {
        const history = await getChatSessionMessages(threadId);
        setUiMessages(history);
      } catch (err) {
        console.error("[会话] 加载历史消息失败:", err);
        if ((err as Error)?.message?.includes("不存在")) {
          setActiveThreadId(null);
          setUiMessages([]);
        }
      } finally {
        setIsLoadingHistory(false);
      }
    },
    [setUiMessages],
  );

  // ── 确保会话存在（首次发消息时创建 chat_sessions 记录） ──
  const ensureSession = useCallback(async (): Promise<string> => {
    const existing = activeThreadIdRef.current;
    if (existing) return existing;

    // 同步生成并设置 threadId，避免等待 createChatSession 期间首条消息丢失 threadId，
    // 否则后端 ObservationalMemory 会在调用 LLM 前硬失败
    const newId = crypto.randomUUID();
    setActiveThreadId(newId);
    activeThreadIdRef.current = newId;

    try {
      await createChatSession(newId);
    } catch (err) {
      // 会话记录创建失败不阻塞消息发送，仅记录日志
      console.error("[会话] 创建会话记录失败（不影响当前消息发送）:", err);
    }
    return newId;
  }, []);

  const sendMessage = useCallback(
    async (data: { text: string; files?: FileUIPart[] }) => {
      setRetryStatus(null);
      // 新会话（无 threadId）时按首条消息自动命名，异步不阻塞消息发送
      const isFirstMessage = !activeThreadIdRef.current;
      const threadId = await ensureSession();
      if (isFirstMessage) {
        const titleSource = data.text || data.files?.[0]?.filename || "新对话";
        void renameChatSession(threadId, makeChatTitle(titleSource))
          .then(() => queryClient.invalidateQueries({ queryKey: chatOptions.list().queryKey }))
          .catch(() => {
            // 命名失败不影响消息发送，忽略
          });
      }
      void rawSendMessage(data);
    },
    [ensureSession, rawSendMessage, queryClient],
  );

  // ── 会话管理 ──

  const switchSession = useCallback(
    async (threadId: string) => {
      if (threadId === activeThreadIdRef.current) return;
      setActiveThreadId(threadId);
      activeThreadIdRef.current = threadId;
      await loadSessionMessages(threadId);
    },
    [loadSessionMessages],
  );

  const createNewSessionFn = useCallback(async () => {
    setRetryStatus(null);
    setActiveThreadId(null);
    activeThreadIdRef.current = null;
    setUiMessages([]);
    // 新会话应清除上一条消息的错误状态，避免错误横幅残留
    clearError();
  }, [setUiMessages, clearError]);

  // clearSession 语义等同开新会话：复用同一份重置逻辑，避免两处状态清理各自漂移
  const clearSession = useCallback(() => {
    void createNewSessionFn();
  }, [createNewSessionFn]);

  const value = useMemo<ChatContextValue>(
    () => ({
      messages,
      sendMessage,
      status,
      retryStatus,
      stop,
      regenerate,
      error,
      clearError,
      setMessages: setUiMessages,
      activeThreadId,
      isLoadingHistory,
      switchSession,
      createNewSession: createNewSessionFn,
      clearSession,
    }),
    [
      messages,
      sendMessage,
      status,
      retryStatus,
      stop,
      regenerate,
      error,
      clearError,
      setUiMessages,
      activeThreadId,
      isLoadingHistory,
      switchSession,
      createNewSessionFn,
      clearSession,
    ],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChatContext() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChatContext must be used within ChatProvider");
  return ctx;
}
