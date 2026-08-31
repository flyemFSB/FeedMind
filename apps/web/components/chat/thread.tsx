/**
 * Thread — 聊天线程主组件
 * 使用 ai-elements Conversation + Message + PromptInput 渲染
 */

import { useTranslation } from "react-i18next";
import { m } from "motion/react";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { VirtualMessages } from "./virtual-messages";
import { Composer } from "./composer";
import { useChatContext } from "@/lib/chat/chat-context";
import { cn } from "@/lib/utils";
import { ArrowDown } from "lucide-react";
import { MotionSpinner } from "@/components/ui/motion-spinner";
import { useMemo } from "react";
import { SubagentInspectorProvider } from "@/lib/chat/subagent-inspector-context";
import { SubagentInspector } from "./subagent-inspector";
import "./thread.css";

interface ThreadProps {
  className?: string | undefined;
  contentClassName?: string | undefined;
}

/** 服务器错误为 errorText JSON 字符串（{ message, ... }），提取可读信息 */
function readableError(err: Error): string {
  try {
    const parsed = JSON.parse(err.message) as { message?: string };
    return parsed.message ?? err.message;
  } catch {
    return err.message;
  }
}

export function Thread({ className, contentClassName }: ThreadProps) {
  return (
    <SubagentInspectorProvider>
      <ThreadContent className={className} contentClassName={contentClassName} />
      <SubagentInspector />
    </SubagentInspectorProvider>
  );
}

function ThreadContent({ className, contentClassName }: ThreadProps) {
  const {
    messages,
    olderMessages,
    hasOlder,
    isLoadingOlder,
    loadOlderMessages,
    status,
    isLoadingHistory,
    sendMessage,
    error,
    clearError,
    regenerate,
  } = useChatContext();
  const { t } = useTranslation();
  const isStreaming = status === "streaming";

  // 渲染视图 = 分页加载的更早消息 + 最新一页（useChat 管理，流式 append）
  const allMessages = useMemo(() => [...olderMessages, ...messages], [olderMessages, messages]);

  // 使用 useMemo 避免每次渲染都重新创建建议数组
  const suggestions = useMemo(
    () => [t("chat.suggestion1"), t("chat.suggestion2"), t("chat.suggestion3")],
    [t],
  );

  return (
    <div
      className={cn(
        "compact-chat relative flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden bg-editorial-surface-card",
        className,
      )}
    >
      <Conversation className="w-full overflow-y-hidden">
        <ConversationContent className={cn("w-full min-w-0 px-4 pt-6 pb-6", contentClassName)}>
          {isLoadingHistory ? (
            <div className="flex items-center justify-center py-24">
              <div className="flex flex-col items-center gap-3 text-editorial-ink-muted">
                <MotionSpinner size={20} />
                <span className="text-body">{t("chat.loadingHistory")}</span>
              </div>
            </div>
          ) : allMessages.length === 0 ? (
            <ConversationEmptyState
              icon={
                <div className="flex size-12 items-center justify-center">
                  <img
                    src="/FeedMind-logo.svg"
                    alt="FeedMind"
                    width={48}
                    height={48}
                    className="size-12 rounded-lg object-cover"
                  />
                </div>
              }
              title={t("chat.emptyTitle")}
              description={t("chat.emptyDescription")}
            >
              <div className="mt-6 flex flex-wrap justify-center gap-2 max-w-xl">
                {suggestions.map((suggestion) => (
                  <m.button
                    key={suggestion}
                    type="button"
                    onClick={() => sendMessage?.({ text: suggestion })}
                    whileHover={{ scale: 1.015 }}
                    whileTap={{ scale: 0.98 }}
                    className="cursor-pointer rounded-md bg-editorial-surface-soft px-3 py-2 text-xs text-editorial-ink-soft hover:bg-editorial-surface-strong hover:text-editorial-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                  >
                    {suggestion}
                  </m.button>
                ))}
              </div>
            </ConversationEmptyState>
          ) : (
            <>
              {hasOlder && (
                <div className="mb-2 flex justify-center">
                  <button
                    type="button"
                    disabled={isLoadingOlder}
                    onClick={() => void loadOlderMessages()}
                    className="cursor-pointer rounded-md border border-editorial-hairline bg-editorial-surface-soft px-3 py-1.5 text-xs text-editorial-ink-soft hover:bg-editorial-surface-strong hover:text-editorial-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-default disabled:opacity-60"
                  >
                    {isLoadingOlder ? t("chat.loadingOlder") : t("chat.loadOlder")}
                  </button>
                </div>
              )}
              <VirtualMessages messages={allMessages} isStreaming={isStreaming} />
            </>
          )}
        </ConversationContent>
        <ConversationScrollButton>
          <ArrowDown size={16} />
        </ConversationScrollButton>
      </Conversation>

      {/* 顶层聊天错误（ObservationalMemory / LLM 调用失败等） */}
      {error && status === "error" && (
        <div className="mx-4 mb-2 flex items-start justify-between gap-3 rounded-md border border-editorial-semantic-error/40 bg-editorial-semantic-error/5 px-3 py-2 text-xs">
          <div className="min-w-0">
            <div className="font-medium text-editorial-semantic-error">{t("chat.errorTitle")}</div>
            <div className="mt-0.5 break-words text-editorial-ink-soft">{readableError(error)}</div>
          </div>
          <button
            type="button"
            onClick={() => {
              clearError();
              void regenerate();
            }}
            className="shrink-0 rounded-md border border-editorial-hairline bg-editorial-surface-card px-2 py-1 text-editorial-ink-soft hover:bg-editorial-surface-strong hover:text-editorial-ink"
          >
            {t("common.regenerate")}
          </button>
        </div>
      )}

      <div className="relative z-10 w-full shrink-0 px-4 pb-2 pt-4">
        <Composer className="w-full" />
      </div>
    </div>
  );
}
