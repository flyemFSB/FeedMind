/**
 * ai-elements PromptInput 组件
 * 消息输入框，支持文本输入、附件、发送/停止
 */
"use client";

import {
  type FormEvent,
  type HTMLAttributes,
  type TextareaHTMLAttributes,
  useCallback,
} from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ArrowUp, Square } from "lucide-react";

/* -------------------------------------------------------------------------- */
/* Types */
/* -------------------------------------------------------------------------- */
export interface PromptInputMessage {
  text: string;
}

/* -------------------------------------------------------------------------- */
/* PromptInput — 输入表单容器 */
/* -------------------------------------------------------------------------- */
export type PromptInputProps = Omit<HTMLAttributes<HTMLFormElement>, "onSubmit"> & {
  onSubmit?: (message: PromptInputMessage, event: FormEvent<HTMLFormElement>) => void;
};

export function PromptInput({ className, onSubmit, children, ...props }: PromptInputProps) {
  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const text = formData.get("message") as string;
      if (text?.trim() && onSubmit) {
        onSubmit({ text }, event);
      }
    },
    [onSubmit],
  );

  return (
    <form className={cn("space-y-3", className)} onSubmit={handleSubmit} {...props}>
      {children}
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* PromptInputTextarea — 文本输入框 */
/* -------------------------------------------------------------------------- */
export type PromptInputTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  value?: string;
  disabled?: boolean;
};

export function PromptInputTextarea({
  className,
  value,
  onChange,
  placeholder = "输入你的研究任务...",
  disabled = false,
  ...props
}: PromptInputTextareaProps) {
  return (
    <textarea
      name="message"
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      rows={2}
      className={cn(
        "block min-h-[64px] max-h-[220px] w-full resize-none border-0 bg-transparent text-[14px] text-editorial-ink placeholder:text-editorial-ink-muted focus:outline-none disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* PromptInputSubmit — 发送/停止按钮 */
/* -------------------------------------------------------------------------- */
export type PromptInputSubmitProps = HTMLAttributes<HTMLButtonElement> & {
  status?: "ready" | "streaming";
  disabled?: boolean;
};

export function PromptInputSubmit({
  className,
  status = "ready",
  disabled = false,
  children,
  ...props
}: PromptInputSubmitProps) {
  const isStreaming = status === "streaming";

  return (
    <Button
      type="submit"
      size="icon"
      className={cn(
        "rounded-md",
        isStreaming
          ? "bg-editorial-surface-soft text-editorial-ink hover:bg-editorial-surface-strong"
          : "bg-primary text-primary-foreground hover:bg-primary/80",
        disabled && "opacity-50 cursor-not-allowed",
        className,
      )}
      disabled={disabled}
      {...props}
    >
      {children || (isStreaming ? <Square size={16} fill="currentColor" /> : <ArrowUp size={18} />)}
    </Button>
  );
}
