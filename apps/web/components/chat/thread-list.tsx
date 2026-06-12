/**
 * ThreadList — 会话列表组件
 * 使用 TanStack Query hooks 替代 assistant-ui 的 ThreadListPrimitive
 * 高内聚：列表项和操作逻辑集中在此
 */
"use client";

import { useChatSessions, useDeleteChatSession } from "@/lib/hooks/use-chats";
import { writeActiveFeedMindThreadId } from "@/lib/api/chats";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { MessageSquare, Trash2, Loader2 } from "lucide-react";

/**
 * AssistantThreadList — 渲染会话列表
 * - 数据来自 useChatSessions() hook
 * - 点击切换会话
 * - 悬停显示删除按钮
 */
export function AssistantThreadList() {
  const { data: sessions = [], isLoading } = useChatSessions();
  const deleteMutation = useDeleteChatSession();
  const navigate = useNavigate();
  const isChatPage = useRouterState({ select: (s) => s.location.pathname }) === "/chat";
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={16} className="animate-spin text-editorial-ink-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {sessions.map((session) => (
        <div key={session.id} className="group grid grid-cols-[1fr_32px] items-center rounded-lg">
          <button
            onClick={() => {
              writeActiveFeedMindThreadId(session.id);
              if (!isChatPage) navigate({ to: "/chat" });
            }}
            className="flex min-w-0 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] text-editorial-ink transition-colors hover:bg-editorial-surface-soft"
          >
            <MessageSquare size={14} className="shrink-0 text-editorial-ink-muted" />
            <span className="min-w-0 flex-1 truncate">
              {session.title || t("chat.sessionTitleDefault")}
            </span>
          </button>
          <button
            onClick={() => deleteMutation.mutate(session.id)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-editorial-ink-muted opacity-0 transition-all hover:bg-editorial-surface-soft hover:text-editorial-semantic-error group-hover:opacity-100 focus:opacity-100"
            title={t("common.delete")}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
