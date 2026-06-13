/**
 * ChatContext — 聊天运行时上下文
 * 使用 @ai-sdk/react 的 useChat hook 替代 assistant-ui 的 useChatRuntime
 * 直接与 Mastra 后端通信，动态注入模型 ID header
 */
"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { getSelectedFeedMindModel } from "@/lib/api/agent";

/** Mastra Chat 路由地址（通过 SSR proxy 转发到 API 服务） */
const CHAT_API = "/api/chat/feedmind";

export interface ChatContextValue {
  messages: ReturnType<typeof useChat>["messages"];
  sendMessage: ReturnType<typeof useChat>["sendMessage"];
  status: ReturnType<typeof useChat>["status"];
  stop: ReturnType<typeof useChat>["stop"];
  regenerate: ReturnType<typeof useChat>["regenerate"];
  setMessages: ReturnType<typeof useChat>["setMessages"];
}

const ChatContext = createContext<ChatContextValue | null>(null);

/**
 * ChatProvider — 提供 useChat 上下文给所有子组件
 * - 使用 DefaultChatTransport 直连 Mastra 后端
 * - 通过自定义 header 传递模型 ID，避免 body 中携带 requestContext 导致 Mastra
 *   "Multiple requestContext sources" 警告
 */
export function ChatProvider({ children }: { children: ReactNode }) {
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: CHAT_API,
        headers: {} as Record<string, string>,
        prepareSendMessagesRequest({ messages }) {
          const feedmindModelId = getSelectedFeedMindModel();
          return {
            body: { messages },
            headers: feedmindModelId ? { "x-feedmind-model-id": feedmindModelId } : {},
          };
        },
      }),
    [],
  );

  const { messages, sendMessage, status, stop, regenerate, setMessages } =
    useChat({ transport });

  return (
    <ChatContext.Provider
      value={{ messages, sendMessage, status, stop, regenerate, setMessages }}
    >
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
