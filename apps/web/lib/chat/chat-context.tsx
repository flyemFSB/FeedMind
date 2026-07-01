/**
 * ChatContext — 聊天运行时上下文
 * 使用 @ai-sdk/react 的 useChat hook 与 Mastra 后端通信
 * 消息持久化由 Agent Memory 自动处理
 */
"use client";

import {
  createContext,
  useContext,
  useMemo,
  useEffect,
  useRef,
  useCallback,
  useState,
  type ReactNode,
} from "react";
import { useChat, type UIMessage } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  getSelectedFeedMindModel,
  getSelectedFeedMindModelId,
  onSelectedFeedMindModelChange,
} from "@/lib/api/agent";
import {
  getChatSessionMessages,
  createChatSession,
  writeActiveFeedMindThreadId,
  readActiveFeedMindThreadId,
  clearActiveFeedMindThreadId,
} from "@/lib/api/chats";

/** Mastra Chat 路由地址（通过 SSR proxy 转发到 API 服务） */
const CHAT_API = "/api/chat/feedmind";

export interface ChatContextValue {
  messages: UIMessage[];
  sendMessage: (data: { text: string }) => void;
  status: ReturnType<typeof useChat>["status"];
  stop: () => void;
  regenerate: () => void;
  setMessages: (messages: UIMessage[] | ((messages: UIMessage[]) => UIMessage[])) => void;
  activeThreadId: string | null;
  isLoadingHistory: boolean;
  switchSession: (threadId: string) => Promise<void>;
  createNewSession: () => Promise<void>;
  clearSession: () => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

/**
 * ChatProvider — 提供 useChat 上下文给所有子组件
 *
 * 消息持久化由 Agent Memory 自动处理
 */
export function ChatProvider({ children }: { children: ReactNode }) {
  const [activeThreadId, setActiveThreadId] = useState<string | null>(() =>
    readActiveFeedMindThreadId(),
  );
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const activeThreadIdRef = useRef<string | null>(activeThreadId);
  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  // ── 当前选中模型的 modelId ──
  const modelIdRef = useRef(getSelectedFeedMindModelId());
  useEffect(() => {
    const unsubscribe = onSelectedFeedMindModelChange(() => {
      modelIdRef.current = getSelectedFeedMindModelId();
    });
    return unsubscribe;
  }, []);

  // ── Transport：传 memory.thread 给 chatRoute，Memory 自动管理历史 ──
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: CHAT_API,
        headers: {} as Record<string, string>,
        prepareSendMessagesRequest({ messages }) {
          const threadId = activeThreadIdRef.current;
          const feedmindModelId = getSelectedFeedMindModel();
          return {
            body: {
              messages,
              ...(threadId ? { memory: { thread: threadId, resource: threadId } } : {}),
            },
            headers: (feedmindModelId ? { "x-feedmind-model-id": feedmindModelId } : {}) as Record<
              string,
              string
            >,
          };
        },
      }),
    [],
  );

  // ── useChat ──
  const {
    messages,
    setMessages: setUiMessages,
    sendMessage: rawSendMessage,
    status,
    stop,
    regenerate,
  } = useChat({
    transport,
    onError: (error) => {
      console.error("[Chat] 流式响应异常:", error);
    },
  });

  // ── 消息加载（从 Memory API 读取历史） ──
  const loadSessionMessages = useCallback(
    async (threadId: string) => {
      setIsLoadingHistory(true);
      try {
        const loaded = await getChatSessionMessages(threadId);
        setUiMessages(loaded);
      } catch (err) {
        console.error("[Chat] 加载历史消息失败:", err);
        if ((err as Error)?.message?.includes("不存在")) {
          clearActiveFeedMindThreadId();
          setActiveThreadId(null);
          setUiMessages([]);
        }
      } finally {
        setIsLoadingHistory(false);
      }
    },
    [setUiMessages],
  );

  // ── 初始化：挂载时加载历史消息 ──
  useEffect(() => {
    if (activeThreadId) {
      loadSessionMessages(activeThreadId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 确保会话存在（首次发消息时创建 chat_sessions 记录） ──
  const ensureSession = useCallback(async (): Promise<string> => {
    const existing = activeThreadIdRef.current;
    if (existing) return existing;

    const newId = crypto.randomUUID();
    await createChatSession(newId);
    writeActiveFeedMindThreadId(newId);
    setActiveThreadId(newId);
    activeThreadIdRef.current = newId;
    return newId;
  }, []);

  const sendMessage = useCallback(
    async (data: { text: string }) => {
      await ensureSession();
      rawSendMessage(data);
    },
    [ensureSession, rawSendMessage],
  );

  // ── 会话管理 ──

  const switchSession = useCallback(
    async (threadId: string) => {
      if (threadId === activeThreadIdRef.current) return;
      writeActiveFeedMindThreadId(threadId);
      setActiveThreadId(threadId);
      activeThreadIdRef.current = threadId;
      await loadSessionMessages(threadId);
    },
    [loadSessionMessages],
  );

  const createNewSessionFn = useCallback(async () => {
    clearActiveFeedMindThreadId();
    setActiveThreadId(null);
    activeThreadIdRef.current = null;
    setUiMessages([]);
  }, [setUiMessages]);

  const clearSession = useCallback(() => {
    clearActiveFeedMindThreadId();
    setActiveThreadId(null);
    activeThreadIdRef.current = null;
    setUiMessages([]);
  }, [setUiMessages]);

  const value = useMemo<ChatContextValue>(
    () => ({
      messages,
      sendMessage,
      status,
      stop,
      regenerate,
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
      stop,
      regenerate,
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
