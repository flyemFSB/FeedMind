/**
 * ai-elements Message 组件
 * 消息渲染：用户消息气泡 / 助手消息纯文字 + Markdown 响应
 *
 * 与官方差异：
 * - 保留 FeedMind editorial 设计令牌
 * - 保留中文 i18n
 * - `from` 限定为 "user" | "assistant"
 */
"use client";

import { memo, type ComponentProps, type HTMLAttributes } from "react";
import { Button } from "@/components/ui/button";
import { MessageResponseContent } from "./message-response";
import { cn } from "@/lib/utils";

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: "user" | "assistant";
};

export function Message({ className, from, children, ...props }: MessageProps) {
  return (
    <div
      className={cn(
        "group flex w-full max-w-[85%] min-w-0 flex-col gap-2 animate-fade-in",
        from === "user" ? "ml-auto items-end" : "items-start",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export type MessageContentProps = HTMLAttributes<HTMLDivElement>;

export function MessageContent({ className, children, ...props }: MessageContentProps) {
  return (
    <div className={cn("w-full space-y-2", className)} {...props}>
      {children}
    </div>
  );
}

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

export type MessageActionsProps = HTMLAttributes<HTMLDivElement>;

export function MessageActions({ className, children, ...props }: MessageActionsProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-1",
        "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
        "transition-opacity duration-150",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export type MessageActionProps = ComponentProps<typeof Button> & {
  tooltip?: string;
  label?: string;
};

export function MessageAction({
  className,
  variant = "ghost",
  size = "icon-sm",
  children,
  label,
  tooltip,
  ...props
}: MessageActionProps) {
  return (
    <Button
      variant={variant}
      size={size}
      className={cn("text-editorial-ink-muted hover:text-editorial-ink", className)}
      aria-label={label || tooltip || ""}
      title={tooltip || label || ""}
      {...props}
    >
      {children}
    </Button>
  );
}
