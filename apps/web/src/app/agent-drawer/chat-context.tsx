// 聊天运行时上下文，封装与 Mastra Agent 之间的流式通信、会话管理与消息持久化

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
import {
  makeChatTitle,
  estimateMessageTokens,
  type MessageTelemetry,
} from "@/app/agent-drawer/chat-utils";

import { getCurrentWorkspaceContext } from "@/app/shell/app-shell-context";
import { LOCAL_RESOURCE_ID } from "@feedmind/contracts";

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
  telemetryMap: Record<string, MessageTelemetry>;
}

export interface ChatActionsContextValue {
  sendMessage: (data: { text: string; files?: FileUIPart[] }) => Promise<void>;
  stop: () => Promise<void>;
  regenerate: () => Promise<void>;
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
  __feedmindChatActionsContext?: Context<ChatActionsContextValue | null>;
};
const ChatContext = (chatContextRegistry.__feedmindChatContext ??=
  createContext<ChatContextValue | null>(null));
const ChatActionsContext = (chatContextRegistry.__feedmindChatActionsContext ??=
  createContext<ChatActionsContextValue | null>(null));

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
        prepareSendMessagesRequest({ messages, trigger }) {
          const threadId = activeThreadIdRef.current;
          const feedmindModelId = getSelectedFeedMindModel();
          const wsContext = getCurrentWorkspaceContext();
          // 历史由服务端 Memory 提供：只发本轮新消息，全量重发会重复写入并造成客户端时间戳错乱
          const outgoing =
            trigger === "regenerate-message" ? messages.slice(-2) : messages.slice(-1);
          return {
            body: {
              messages: outgoing,
              ...(threadId ? { memory: { thread: threadId, resource: LOCAL_RESOURCE_ID } } : {}),
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
  const [telemetryMap, setTelemetryMap] = useState<Record<string, MessageTelemetry>>({});
  const requestStartRef = useRef<number | null>(null);
  const firstTokenRef = useRef<number | null>(null);

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
    onFinish: (options) => {
      setRetryStatus(null);
      const finishTime = performance.now();
      const startTime = requestStartRef.current;
      const firstToken = firstTokenRef.current;
      if (startTime && options?.message) {
        const durationMs = Math.round(finishTime - startTime);
        const ttftMs = firstToken ? Math.round(firstToken - startTime) : undefined;
        const genTimeSec = firstToken
          ? Math.max(0.1, (finishTime - firstToken) / 1000)
          : durationMs / 1000;
        const outputTokens = estimateMessageTokens(options.message);
        const tps = Number((outputTokens / genTimeSec).toFixed(1));
        setTelemetryMap((prev) => ({
          ...prev,
          [options.message.id]: {
            ttftMs,
            durationMs,
            tps,
            outputTokens,
          },
        }));
      }
      requestStartRef.current = null;
      firstTokenRef.current = null;
    },
    onError: (error) => {
      setRetryStatus(null);
      requestStartRef.current = null;
      firstTokenRef.current = null;
      console.error("[会话] 流式响应接收异常:", error);
    },
  });

  // ── 首 Token 到达时记录打点（供 onFinish 结算 TTFT） ──
  useEffect(() => {
    if (
      status !== "streaming" ||
      requestStartRef.current === null ||
      firstTokenRef.current !== null
    ) {
      return;
    }
    const lastMsg = messages.at(-1);
    if (lastMsg?.role === "assistant" && lastMsg.parts.length > 0) {
      const hasContent = lastMsg.parts.some((p) => {
        if (p.type === "text" && (p as { text: string }).text.length > 0) return true;
        if (p.type === "reasoning" && (p as { text: string }).text.length > 0) return true;
        if (typeof p.type === "string" && p.type.startsWith("tool-")) return true;
        return false;
      });
      if (hasContent) {
        firstTokenRef.current = performance.now();
      }
    }
  }, [status, messages]);

  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const stop = useCallback(async () => {
    setRetryStatus(null);
    const finishTime = performance.now();
    const startTime = requestStartRef.current;
    if (startTime) {
      const lastMsg = messagesRef.current.at(-1);
      if (lastMsg && lastMsg.role === "assistant") {
        const durationMs = Math.round(finishTime - startTime);
        const firstToken = firstTokenRef.current;
        const ttftMs = firstToken ? Math.round(firstToken - startTime) : undefined;
        const genTimeSec = firstToken
          ? Math.max(0.1, (finishTime - firstToken) / 1000)
          : durationMs / 1000;
        const outputTokens = estimateMessageTokens(lastMsg);
        const tps = Number((outputTokens / genTimeSec).toFixed(1));
        setTelemetryMap((prev) => ({
          ...prev,
          [lastMsg.id]: {
            ttftMs,
            durationMs,
            tps,
            outputTokens,
          },
        }));
      }
    }
    requestStartRef.current = null;
    firstTokenRef.current = null;
    await rawStop();
  }, [rawStop]);

  const regenerate = useCallback(async () => {
    setRetryStatus(null);
    requestStartRef.current = performance.now();
    firstTokenRef.current = null;
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
      requestStartRef.current = performance.now();
      firstTokenRef.current = null;
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
      setTelemetryMap({});
      requestStartRef.current = null;
      firstTokenRef.current = null;
      setActiveThreadId(threadId);
      activeThreadIdRef.current = threadId;
      await loadSessionMessages(threadId);
    },
    [loadSessionMessages],
  );

  const createNewSessionFn = useCallback(async () => {
    setRetryStatus(null);
    setTelemetryMap({});
    requestStartRef.current = null;
    firstTokenRef.current = null;
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
      telemetryMap,
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
      telemetryMap,
    ],
  );

  const actionsValue = useMemo<ChatActionsContextValue>(
    () => ({
      sendMessage,
      stop,
      regenerate,
      clearError,
      setMessages: setUiMessages,
      activeThreadId,
      isLoadingHistory,
      switchSession,
      createNewSession: createNewSessionFn,
      clearSession,
    }),
    [
      sendMessage,
      stop,
      regenerate,
      clearError,
      setUiMessages,
      activeThreadId,
      isLoadingHistory,
      switchSession,
      createNewSessionFn,
      clearSession,
    ],
  );

  return (
    <ChatActionsContext.Provider value={actionsValue}>
      <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
    </ChatActionsContext.Provider>
  );
}

export function useChatContext() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChatContext must be used within ChatProvider");
  return ctx;
}

export function useChatActions() {
  const ctx = useContext(ChatActionsContext);
  if (!ctx) throw new Error("useChatActions must be used within ChatProvider");
  return ctx;
}
