/**
 * Thread — 聊天线程主组件
 * 使用 ai-elements Conversation + Message + PromptInput 渲染
 */
"use client";

import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "motion/react";
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { MessageParts } from "./message-parts";
import { Composer } from "./composer";
import { useChatContext } from "@/lib/chat/chat-context";
import { ArrowDown, Loader2 } from "lucide-react";

/**
 * Thread — 聊天视图容器
 * - 空状态显示品牌提示和建议
 * - 消息流式渲染
 * - 底部固定 Composer
 */
export function Thread() {
  const { messages, status, isLoadingHistory } = useChatContext();
  const { t } = useTranslation();
  const isStreaming = status === "streaming";

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-editorial-surface-card">
      <Conversation>
        <ConversationContent className="max-w-4xl w-full mx-auto px-6 pt-6 pb-[220px]">
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
                <div className="size-14 rounded-2xl bg-gradient-to-br from-editorial-ink to-editorial-primary-active flex items-center justify-center">
                  <img
                    src="/FeedMind-logo.svg"
                    alt="FeedMind"
                    width={56}
                    height={56}
                    className="size-14 rounded-2xl object-cover"
                  />
                </div>
              }
              title={t("chat.emptyTitle")}
              description={t("chat.emptyDescription")}
            >
              <div className="mt-6 flex flex-wrap justify-center gap-2 max-w-xl">
                {[t("chat.suggestion1"), t("chat.suggestion2"), t("chat.suggestion3")].map(
                  (suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      className="px-3 py-2 rounded-xl border border-editorial-hairline text-[13px] text-editorial-ink hover:bg-editorial-surface-soft transition-colors cursor-pointer"
                    >
                      {suggestion}
                    </button>
                  ),
                )}
              </div>
            </ConversationEmptyState>
          ) : (
            <AnimatePresence initial={false}>
              {messages.map((message, idx) => (
                <motion.div
                  key={`${message.id}-${idx}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
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

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-6 pb-6 pt-16">
        <div className="absolute inset-y-0 left-6 right-6 z-0 mx-auto max-w-3xl bg-gradient-to-t from-editorial-surface-card via-editorial-surface-card/95 to-transparent" />
        <div className="relative z-10 pointer-events-auto max-w-3xl mx-auto w-full">
          <Composer />
        </div>
      </div>
    </div>
  );
}
