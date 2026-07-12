/**
 * Composer — 消息输入组件
 * 使用 ai-elements PromptInput，适配 FeedMind 设计系统
 * IME 安全的中文输入支持
 */
"use client";

import { useRef, useState, type ChangeEvent } from "react";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { useChatContext } from "@/lib/chat/chat-context";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Paperclip, X } from "lucide-react";

interface ComposerProps {
  className?: string;
  textareaClassName?: string;
}

export function Composer({ className, textareaClassName }: ComposerProps) {
  const { sendMessage, status, stop } = useChatContext();
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isComposingRef = useRef(false);
  const isLoading = status === "streaming" || status === "submitted";

  const handleSubmit = (text: string) => {
    if (!text.trim() || isLoading) return;
    sendMessage({ text: text.trim() });
    setInput("");
    setFiles([]);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    setFiles((prev) => [...prev, ...selected]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div
      className={cn(
        "rounded-xl border border-editorial-hairline bg-editorial-surface-card p-4 shadow-sm",
        className,
      )}
    >
      <PromptInput onSubmit={(message) => handleSubmit(message.text)} className="space-y-3">
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {files.map((file, i) => (
              <div
                key={i}
                className="flex items-center gap-1 rounded-md border border-editorial-hairline bg-editorial-surface-soft px-2 py-1 text-[12px] text-editorial-ink-soft"
              >
                <span className="max-w-[120px] truncate">{file.name}</span>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="ml-1 text-editorial-ink-muted hover:text-editorial-semantic-error"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
        <PromptInputTextarea
          value={input}
          onChange={(e) => {
            const next = e.currentTarget.value;
            setInput(next);
          }}
          onCompositionStart={() => {
            isComposingRef.current = true;
          }}
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
          className={cn("min-h-[64px]", textareaClassName)}
        />
        <div className="flex items-center justify-between mt-3">
          <div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-8 w-8 items-center justify-center rounded-full text-editorial-ink-muted hover:text-editorial-ink hover:bg-editorial-surface-soft transition-colors"
              title={t("chat.addAttachment")}
            >
              <Paperclip size={15} />
            </button>
          </div>
          {isLoading ? (
            <PromptInputSubmit status="streaming" onClick={() => stop()} className="h-10 w-10" />
          ) : (
            <PromptInputSubmit status="ready" disabled={!input.trim()} className="h-10 w-10" />
          )}
        </div>
      </PromptInput>
    </div>
  );
}
