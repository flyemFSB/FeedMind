/**
 * ChatContext — 聊天运行时上下文
 * 使用 @ai-sdk/react 的 useChat hook 替代 assistant-ui 的 useChatRuntime
 * 直接与 Mastra 后端通信，动态注入模型 ID header
 *
 * 新增功能：
 * - 会话管理（创建/切换/新建）
 * - 消息持久化（加载历史消息、完成后保存）
 * - 幂等 upsert，支持分支管理
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
import { useQueryClient } from "@tanstack/react-query";
import {
  getSelectedFeedMindModel,
  getSelectedFeedMindModelId,
  onSelectedFeedMindModelChange,
} from "@/lib/api/agent";
import {
  getChatSessionMessages,
  saveChatSession,
  createChatSession,
  writeActiveFeedMindThreadId,
  readActiveFeedMindThreadId,
  clearActiveFeedMindThreadId,
  chatKeys,
  type ChatMessageSnapshot,
  type ChatMessageRead,
} from "@/lib/api/chats";

/** Mastra Chat 路由地址（通过 SSR proxy 转发到 API 服务） */
const CHAT_API = "/api/chat/feedmind";

export interface ChatContextValue {
  /** 当前会话的所有消息 */
  messages: UIMessage[];
  /** 发送消息（自动创建会话、完成后自动持久化） */
  sendMessage: (data: { text: string }) => void;
  /** 连接状态 */
  status: ReturnType<typeof useChat>["status"];
  /** 停止流式响应 */
  stop: () => void;
  /** 重新生成最后一条助手消息 */
  regenerate: () => void;
  /** 直接设置消息（用于会话切换时加载历史） */
  setMessages: (
    messages: UIMessage[] | ((messages: UIMessage[]) => UIMessage[]),
  ) => void;
  /** 当前活跃会话 ID */
  activeThreadId: string | null;
  /** 是否正在加载历史消息 */
  isLoadingHistory: boolean;
  /** 切换到指定会话 */
  switchSession: (threadId: string) => Promise<void>;
  /** 创建新会话（清空当前消息） */
  createNewSession: () => Promise<void>;
  /** 立即保存当前会话 */
  saveCurrentSession: () => Promise<void>;
}

const ChatContext = createContext<ChatContextValue | null>(null);

// ─── 消息格式转换 ──────────────────────────────────

/** 从 UIMessage 提取纯文本内容（拼接所有 text part） */
function extractTextContent(msg: UIMessage): string {
  return msg.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

/** 将持久化的消息记录还原为 UIMessage */
function readToUIMessage(msg: ChatMessageRead): UIMessage {
  return {
    id: msg.agent_message_id,
    role: msg.role as "user" | "assistant" | "system",
    parts: [{ type: "text" as const, text: msg.content }],
  } as UIMessage;
}

/** 将 UIMessage 转为持久化快照 */
function uiMessageToSnapshot(msg: UIMessage, modelId: string): ChatMessageSnapshot {
  return {
    agent_message_id: msg.id,
    role: msg.role === "assistant" ? "assistant" : msg.role === "user" ? "user" : "system",
    content: extractTextContent(msg),
    status: "completed",
    model: modelId,
    metadata: {},
  };
}

/** 构建完整会话快照 */
function buildSnapshot(messages: UIMessage[], modelId: string): { messages: ChatMessageSnapshot[] } {
  return { messages: messages.map(msg => uiMessageToSnapshot(msg, modelId)) };
}

/**
 * ChatProvider — 提供 useChat 上下文给所有子组件
 *
 * 生命周期：
 * 1. 挂载时读取 localStorage 中的活跃 threadId
 * 2. 有 threadId → 从 API 加载历史消息 → 设置到 useChat
 * 3. 用户发送消息 → 确保会话存在 → useChat 发送到 Mastra
 * 4. 流式完成后（onFinish）→ 保存消息快照到 API
 * 5. 会话切换 → 保存当前 → 加载新会话的消息
 * 6. 新建会话 → 清空消息 → 生成新 threadId
 */
export function ChatProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  // ── 会话状态 ──
  const [activeThreadId, setActiveThreadId] = useState<string | null>(() =>
    readActiveFeedMindThreadId(),
  );
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // 使用 ref 保存最新值，避免 onFinish 闭包捕获过期值
  const activeThreadIdRef = useRef<string | null>(activeThreadId);
  const messagesRef = useRef<UIMessage[]>([]);
  useEffect(() => { activeThreadIdRef.current = activeThreadId; }, [activeThreadId]);

  // ── 当前选中模型的 modelId（API 模型标识符，如 "deepseek-v4-flash"）──
  const modelIdRef = useRef(getSelectedFeedMindModelId());
  useEffect(() => {
    const unsubscribe = onSelectedFeedMindModelChange(() => {
      modelIdRef.current = getSelectedFeedMindModelId();
    });
    return unsubscribe;
  }, []);

  // ── Transport 配置 ──
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: CHAT_API,
        headers: {} as Record<string, string>,
        prepareSendMessagesRequest({ messages }) {
          const feedmindModelId = getSelectedFeedMindModel();
          return {
            body: { messages },
            headers: (feedmindModelId
              ? { "x-feedmind-model-id": feedmindModelId }
              : {}) as Record<string, string>,
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
    onFinish: async () => {
      // 流完成后自动持久化
      const threadId = activeThreadIdRef.current;
      if (!threadId) return;
      await persistMessages(threadId);
    },
    onError: (error) => {
      console.error("[Chat] Stream error:", error);
    },
  });

  // 保持 messagesRef 同步
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // ── 持久化逻辑 ──

  /** 保存当前消息到指定会话 */
  const persistMessages = useCallback(
    async (threadId: string) => {
      const currentMessages = messagesRef.current;
      if (currentMessages.length === 0 || isSaving) return;
      setIsSaving(true);
      try {
        const snapshot = buildSnapshot(currentMessages, modelIdRef.current);
        await saveChatSession(threadId, snapshot);
        // 刷新侧边栏列表
        queryClient.invalidateQueries({ queryKey: chatKeys.list() });
      } catch (err) {
        console.error("[Chat] Failed to persist messages:", err);
      } finally {
        setIsSaving(false);
      }
    },
    [queryClient],
  );

  // ── 消息加载 ──

  /** 加载指定会话的消息并设置到 useChat */
  const loadSessionMessages = useCallback(
    async (threadId: string) => {
      setIsLoadingHistory(true);
      try {
        const loaded = await getChatSessionMessages(threadId);
        const uiMessages = loaded.map(readToUIMessage);
        setUiMessages(uiMessages);
      } catch (err) {
        console.error("[Chat] Failed to load messages:", err);
        // 会话不存在则重置
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
  }, []); // 仅在挂载时执行一次

  // ── 确保会话存在的辅助函数 ──
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

  // ── 包装 sendMessage：先确保会话存在 ──
  const sendMessage = useCallback(
    async (data: { text: string }) => {
      await ensureSession();
      rawSendMessage(data);
    },
    [ensureSession, rawSendMessage],
  );

  // ── 会话管理 ──

  /** 切换到指定会话 */
  const switchSession = useCallback(
    async (threadId: string) => {
      if (threadId === activeThreadIdRef.current) return;

      // 保存当前会话
      await persistMessages(activeThreadIdRef.current!);

      // 切换到新会话
      writeActiveFeedMindThreadId(threadId);
      setActiveThreadId(threadId);
      activeThreadIdRef.current = threadId;
      await loadSessionMessages(threadId);
    },
    [persistMessages, loadSessionMessages],
  );

  /** 创建新会话 */
  const createNewSessionFn = useCallback(async () => {
    // 保存当前会话如果有消息
    const currentId = activeThreadIdRef.current;
    if (currentId && messagesRef.current.length > 0) {
      await persistMessages(currentId);
    }

    clearActiveFeedMindThreadId();
    setActiveThreadId(null);
    activeThreadIdRef.current = null;
    setUiMessages([]);
  }, [persistMessages, setUiMessages]);

  /** 立即保存当前会话 */
  const saveCurrentSession = useCallback(async () => {
    const threadId = activeThreadIdRef.current;
    if (threadId) {
      await persistMessages(threadId);
    }
  }, [persistMessages]);

  // ── 上下文值 ──
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
      saveCurrentSession,
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
      saveCurrentSession,
    ],
  );

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
}

/**
 * useChatContext — 获取聊天上下文
 */
export function useChatContext() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChatContext must be used within ChatProvider");
  return ctx;
}
