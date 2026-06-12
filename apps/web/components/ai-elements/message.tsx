/**
 * ai-elements Message 组件
 * 消息渲染：用户消息气泡 / 助手消息纯文字 + Markdown 响应
 */
"use client";

import { memo, type ComponentProps, type HTMLAttributes } from "react";
import { MessageResponseContent } from "./message-response";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* Message — 单条消息容器 */
/* -------------------------------------------------------------------------- */
export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: "user" | "assistant";
};

export function Message({ className, from, children, ...props }: MessageProps) {
  return (
    <div
      className={cn(
        "group flex w-full max-w-[85%] flex-col gap-2 animate-fade-in",
        from === "user" ? "ml-auto items-end" : "items-start",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* MessageContent — 消息主体内容 */
/* -------------------------------------------------------------------------- */
export type MessageContentProps = HTMLAttributes<HTMLDivElement>;

export function MessageContent({ className, children, ...props }: MessageContentProps) {
  return (
    <div className={cn("w-full space-y-2", className)} {...props}>
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* MessageResponse — Markdown 渲染（流式支持） */
/* -------------------------------------------------------------------------- */
export type MessageResponseProps = {
  className?: string;
  children?: string;
};

export const MessageResponse = memo(function MessageResponse({
  className,
  ...props
}: MessageResponseProps) {
  return (
    <MessageResponseContent
      className={cn(
        "prose prose-sm max-w-none",
        "prose-headings:text-editorial-ink prose-headings:font-display",
        "prose-p:text-body-md prose-p:text-editorial-ink-soft",
        "prose-a:text-editorial-primary prose-a:no-underline hover:prose-a:underline",
        "prose-strong:text-editorial-ink",
        "prose-code:before:content-none prose-code:after:content-none",
        "prose-pre:bg-transparent prose-pre:p-0",
        "prose-li:text-editorial-ink-soft",
        className,
      )}
      {...props}
    />
  );
});

/* -------------------------------------------------------------------------- */
/* MessageActions — 操作按钮容器 */
/* -------------------------------------------------------------------------- */
export type MessageActionsProps = HTMLAttributes<HTMLDivElement>;

export function MessageActions({ className, children, ...props }: MessageActionsProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* MessageAction — 单个操作按钮 */
/* -------------------------------------------------------------------------- */
export type MessageActionProps = ComponentProps<"button"> & {
  tooltip?: string;
  label?: string;
};

export function MessageAction({
  className,
  children,
  label,
  tooltip,
  ...props
}: MessageActionProps) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-md",
        "text-editorial-ink-muted hover:text-editorial-ink hover:bg-editorial-surface-soft",
        "transition-colors",
        className,
      )}
      aria-label={label || tooltip || ""}
      title={tooltip || label || ""}
      {...props}
    >
      {children}
    </button>
  );
}
