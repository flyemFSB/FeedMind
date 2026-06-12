/**
 * ai-elements Conversation 组件
 * 聊天容器，支持自动滚动到底部
 */
"use client";

import { useCallback } from "react";
import type { ComponentProps, HTMLAttributes, ReactNode } from "react";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ArrowDown } from "lucide-react";

/* -------------------------------------------------------------------------- */
/* Conversation 容器 */
/* -------------------------------------------------------------------------- */
export type ConversationProps = ComponentProps<typeof StickToBottom>;

export function Conversation({ className, children, ...props }: ConversationProps) {
  return (
    <StickToBottom
      className={cn("relative flex min-h-0 flex-1 flex-col", className)}
      {...props}
    >
      {children}
    </StickToBottom>
  );
}

/* -------------------------------------------------------------------------- */
/* ConversationContent — 消息列表区域 */
/* -------------------------------------------------------------------------- */
export type ConversationContentProps = ComponentProps<typeof StickToBottom.Content>;

export function ConversationContent({ className, children, ...props }: ConversationContentProps) {
  return (
    <StickToBottom.Content
      className={cn("flex flex-col gap-6 p-4", className)}
      {...props}
    >
      {children}
    </StickToBottom.Content>
  );
}

/* -------------------------------------------------------------------------- */
/* ConversationEmptyState — 空状态 */
/* -------------------------------------------------------------------------- */
export type ConversationEmptyStateProps = HTMLAttributes<HTMLDivElement> & {
  icon?: ReactNode;
  title?: string;
  description?: string;
};

export function ConversationEmptyState({
  className,
  icon,
  title,
  description,
  children,
  ...props
}: ConversationEmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-16 text-center",
        className,
      )}
      {...props}
    >
      {icon && <div className="mb-4">{icon}</div>}
      {title && (
        <h2 className="text-display-md text-editorial-ink mb-2">{title}</h2>
      )}
      {description && (
        <p className="text-body-md text-editorial-ink-soft max-w-md mx-auto">
          {description}
        </p>
      )}
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* ConversationScrollButton — 滚动到底部按钮 */
/* -------------------------------------------------------------------------- */
export type ConversationScrollButtonProps = ComponentProps<typeof Button>;

export function ConversationScrollButton({
  className,
  children,
  ...props
}: ConversationScrollButtonProps) {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  const handleScroll = useCallback(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  if (isAtBottom) return null;

  return (
    <Button
      variant="outline"
      size="icon"
      className={cn(
        "absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-editorial-surface-card shadow-md",
        className,
      )}
      onClick={handleScroll}
      type="button"
      {...props}
    >
      {children || <ArrowDown size={16} />}
    </Button>
  );
}
