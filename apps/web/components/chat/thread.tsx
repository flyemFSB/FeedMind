/**
 * Thread — 聊天线程主组件
 * 使用 ai-elements Conversation + Message + PromptInput 渲染
 */
"use client";

import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "motion/react";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { MessageParts } from "./message-parts";
import { Composer } from "./composer";
import { useChatContext } from "@/lib/chat/chat-context";
import { cn } from "@/lib/utils";
import { ArrowDown, Loader2 } from "lucide-react";
import "./thread.css";

interface ThreadProps {
  className?: string;
  contentClassName?: string;
}

export function Thread({ className, contentClassName }: ThreadProps) {
  const { messages, status, isLoadingHistory, sendMessage } = useChatContext();
  const { t } = useTranslation();
  const isStreaming = status === "streaming";
  const suggestions = [t("chat.suggestion1"), t("chat.suggestion2"), t("chat.suggestion3")];

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
                <Loader2 size={20} className="animate-spin" />
                <span className="text-[13px]">{t("chat.loadingHistory")}</span>
              </div>
            </div>
          ) : messages.length === 0 ? (
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
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => sendMessage?.({ text: suggestion })}
                    className="cursor-pointer rounded-md bg-editorial-surface-soft px-3 py-2 text-[12px] text-editorial-ink-soft transition-colors hover:bg-editorial-surface-strong hover:text-editorial-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </ConversationEmptyState>
          ) : (
            <AnimatePresence initial={false}>
              {messages.map((message, idx) => (
                <motion.div
                  key={`${message.id}-${idx}`}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
                  className="min-w-0"
                >
                  <MessageParts
                    message={message}
                    isLastMessage={idx === messages.length - 1}
                    isStreaming={isStreaming}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </ConversationContent>
        <ConversationScrollButton>
          <ArrowDown size={16} />
        </ConversationScrollButton>
      </Conversation>

      <div className="relative z-10 w-full shrink-0 px-4 pb-2 pt-4">
        <Composer className="w-full" />
      </div>
    </div>
  );
}
