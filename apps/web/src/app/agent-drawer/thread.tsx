/**
 * Thread — 聊天线程主组件
 * 使用 ai-elements Conversation + Message + PromptInput 渲染
 */

import { useTranslation } from "react-i18next";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Suggestion } from "@/components/ai-elements/suggestion";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { VirtualMessages } from "./virtual-messages";
import { Composer } from "./composer";
import { useChatContext } from "@/app/agent-drawer/chat-context";
import { cn } from "@/lib/utils";
import { ArrowDown, Bot, Loader2, Sparkles } from "lucide-react";
import { MotionSpinner } from "@/components/ui/motion-spinner";
import { useMemo } from "react";
import { SubagentInspectorProvider } from "@/app/agent-drawer/subagent-inspector-context";
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

  // 用户点击提交后、后端首个 chunk 到达前，即时显示正在思考的回复状态
  const isWaitingResponse =
    status === "submitted" ||
    (status === "streaming" && allMessages.length > 0 && allMessages.at(-1)?.role === "user");

  // 空白初始态建议词
  const suggestions = useMemo(
    () => [t("chat.suggestion1"), t("chat.suggestion2"), t("chat.suggestion3")],
    [t],
  );

  const isInitialEmpty = allMessages.length === 0 && !isLoadingHistory;

  return (
    <div
      className={cn(
        "compact-chat relative flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden bg-editorial-surface-card",
        className,
      )}
    >
      {/* 初始空白态：产品 Logo + 名称居中，输入框与建议词直接置于中央 */}
      {isInitialEmpty ? (
        <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-8">
          <div className="flex w-full max-w-lg flex-col items-center text-center">
            {/* 产品 Logo 与品牌 */}
            <div className="flex size-14 items-center justify-center rounded-2xl border border-editorial-hairline bg-editorial-surface-card p-1 shadow-island">
              <img
                src="/FeedMind-logo.svg"
                alt="FeedMind"
                width={44}
                height={44}
                className="size-full rounded-xl object-cover"
              />
            </div>
            <h2 className="mt-3 text-xl font-semibold tracking-tight text-editorial-ink">
              FeedMind
            </h2>
            <p className="mt-1 text-xs text-editorial-ink-muted">
              {t("chat.emptyDescription", "你的个人知识管理、AI 对话与洞察探索助理")}
            </p>

            {/* 居中放置输入框 */}
            <div className="mt-6 w-full">
              <Composer className="w-full shadow-island" />
            </div>

            {/* 推荐问题列表：前 2 个占第一行两列，第 3 个在第二行居中 */}
            <div className="mt-5 w-full">
              <div className="grid grid-cols-2 gap-2.5 w-full">
                {suggestions.map((suggestion, index) => (
                  <Suggestion
                    key={suggestion}
                    onClick={() => sendMessage?.({ text: suggestion })}
                    icon={<Sparkles size={13} className="text-editorial-accent shrink-0" />}
                    className={cn(
                      "w-full justify-center text-center",
                      index === 2 && "col-span-2 justify-self-center w-auto max-w-[90%] px-5",
                    )}
                  >
                    {suggestion}
                  </Suggestion>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* 已有消息或加载历史：标准滚动列表视图与底部固定输入框 */
        <>
          <Conversation className="w-full overflow-y-hidden">
            <ConversationContent className={cn("w-full min-w-0 px-4 pt-6 pb-6", contentClassName)}>
              {isLoadingHistory ? (
                <div className="flex items-center justify-center py-24">
                  <div className="flex flex-col items-center gap-3 text-editorial-ink-muted">
                    <MotionSpinner size={20} />
                    <span className="text-body">{t("chat.loadingHistory")}</span>
                  </div>
                </div>
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

                  {/* 用户刚输入后立刻显示的助手思考动效，提供连续反馈 */}
                  {isWaitingResponse && (
                    <div className="flex w-full items-start gap-2 pt-2">
                      <div className="flex size-6 shrink-0 items-center justify-center rounded-md border border-editorial-hairline bg-editorial-surface-soft text-editorial-accent">
                        <Bot size={13} />
                      </div>
                      <div className="flex items-center gap-2 rounded-lg border border-editorial-hairline/60 bg-editorial-surface-soft/40 px-3 py-2 text-xs text-editorial-ink-muted shadow-2xs">
                        <Loader2 size={13} className="animate-spin text-editorial-accent" />
                        <Shimmer duration={1.2}>FeedMind 正在思考与组织回答...</Shimmer>
                      </div>
                    </div>
                  )}
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
                <div className="font-medium text-editorial-semantic-error">
                  {t("chat.errorTitle")}
                </div>
                <div className="mt-0.5 break-words text-editorial-ink-soft">
                  {readableError(error)}
                </div>
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

          {/* 底部固定输入框 */}
          <div className="relative z-10 w-full shrink-0 px-4 pb-2 pt-3">
            <Composer className="w-full" />
          </div>
        </>
      )}
    </div>
  );
}
