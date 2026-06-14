/**
 * Composer — 消息输入组件
 * 使用 ai-elements PromptInput，适配 FeedMind 设计系统
 * IME 安全的中文输入支持
 */
"use client";

import { useRef, useState } from "react";
import { PromptInput, PromptInputTextarea, PromptInputSubmit } from "@/components/ai-elements/prompt-input";
import { useChatContext } from "@/lib/chat/chat-context";
import { useTranslation } from "react-i18next";
import { Plus, Square } from "lucide-react";

/**
 * Composer — 聊天输入框
 * - Enter 发送，Shift+Enter 换行
 * - IME 安全性（中文输入法候选词期间不回车上屏）
 * - 流式时显示停止按钮
 */
export function Composer() {
  const { sendMessage, status, stop } = useChatContext();
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const isComposingRef = useRef(false);
  const isLoading = status === "streaming" || status === "submitted";

  const handleSubmit = (text: string) => {
    if (!text.trim() || isLoading) return;
    sendMessage({ text: text.trim() });
    setInput("");
  };

  return (
    <div className="rounded-[28px] border border-editorial-hairline bg-editorial-surface-card p-4 shadow-[0_18px_50px_rgba(0,0,0,0.12)] dark:shadow-[0_18px_50px_rgba(0,0,0,0.6)]">
      <PromptInput
        onSubmit={(message) => handleSubmit(message.text)}
        className="space-y-3"
      >
        <PromptInputTextarea
          value={input}
          onChange={(e) => {
            const next = e.currentTarget.value;
            setInput(next);
          }}
          onCompositionStart={() => { isComposingRef.current = true; }}
          onCompositionEnd={(e: React.CompositionEvent<HTMLTextAreaElement>) => {
            isComposingRef.current = false;
            setInput(e.currentTarget.value);
          }}
          onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (e.key === "Enter" && !e.shiftKey && !isComposingRef.current && !isLoading) {
              e.preventDefault();
              handleSubmit(input);
            }
          }}
          placeholder={t("chat.placeholder")}
          disabled={isLoading}
          className="min-h-[64px]"
        />
        <div className="flex items-center justify-between mt-3">
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-full text-editorial-ink-soft hover:text-editorial-ink hover:bg-editorial-surface-soft transition-colors"
            title={t("common.attach")}
          >
            <Plus size={21} strokeWidth={1.8} />
          </button>
          {isLoading ? (
            <button
              type="button"
              onClick={() => stop()}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-editorial-surface-soft text-editorial-ink hover:bg-editorial-surface-strong transition-colors"
              title={t("common.stop")}
            >
              <Square size={16} fill="currentColor" />
            </button>
          ) : (
            <PromptInputSubmit
              status="ready"
              disabled={!input.trim()}
              className="h-10 w-10"
            />
          )}
        </div>
      </PromptInput>
    </div>
  );
}
