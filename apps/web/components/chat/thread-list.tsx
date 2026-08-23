/**
 * ThreadList — 会话列表组件
 * 使用 TanStack Query hooks 替代 assistant-ui 的 ThreadListPrimitive
 * 高内聚：列表项和操作逻辑集中在此
 */

import { useChatSessions } from "@/lib/hooks/use-chats";
import { useChatSessionDelete } from "@/lib/hooks/use-chat-session-delete";
import { useChatContext } from "@/lib/chat/chat-context";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
import { MessageSquare, Trash2 } from "lucide-react";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { MotionSpinner } from "@/components/ui/motion-spinner";

/**
 * AssistantThreadList — 渲染会话列表
 * - 数据来自 useChatSessions() hook
 * - 点击切换会话
 * - 悬停显示删除按钮
 */
export function AssistantThreadList() {
  const { data: sessions = [], isLoading } = useChatSessions();
  const { switchSession, activeThreadId } = useChatContext();
  const deleteConfirm = useChatSessionDelete();
  const navigate = useNavigate();
  const isChatPage = useRouterState({ select: (s) => s.location.pathname }) === "/chat";
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <MotionSpinner size={16} className="text-editorial-ink-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {sessions.map((session) => {
        const isActive = session.agent_thread_id === activeThreadId;
        return (
          <div key={session.id} className="group grid grid-cols-[1fr_32px] items-center rounded-lg">
            <motion.button
              onClick={() => {
                void switchSession(session.agent_thread_id);
                if (!isChatPage) void navigate({ to: "/chat" });
              }}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              className={`flex min-w-0 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-body hover:bg-editorial-surface-strong hover:text-editorial-ink active:bg-editorial-hairline-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-editorial-hairline-strong ${
                isActive
                  ? "bg-editorial-surface-strong text-editorial-ink"
                  : "text-editorial-ink-soft"
              }`}
            >
              <MessageSquare
                size={14}
                className={`shrink-0 ${isActive ? "text-editorial-ink" : "text-editorial-ink-muted"}`}
              />
              <span className="min-w-0 flex-1 truncate">
                {session.title || t("chat.sessionTitleDefault")}
              </span>
            </motion.button>
            <motion.button
              onClick={() => deleteConfirm.setDeleteTarget(session.agent_thread_id)}
              whileHover={{ scale: 1.05, opacity: 1 }}
              whileTap={{ scale: 0.9 }}
              className="flex h-7 w-7 items-center justify-center rounded-md text-editorial-ink-muted opacity-0 hover:bg-editorial-surface-strong hover:text-editorial-semantic-error group-hover:opacity-100 focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-editorial-hairline-strong"
              title={t("common.delete")}
            >
              <Trash2 size={14} />
            </motion.button>
          </div>
        );
      })}

      <DeleteConfirmDialog
        open={deleteConfirm.deleteTarget != null}
        onClose={deleteConfirm.handleClose}
        onConfirm={deleteConfirm.handleConfirm}
        title={t("chat.deleteSession")}
        description={
          deleteConfirm.deleteTarget
            ? t("chat.deleteSessionConfirm", {
                title:
                  sessions.find((s) => s.agent_thread_id === deleteConfirm.deleteTarget)?.title ??
                  t("chat.sessionTitleDefault"),
              })
            : undefined
        }
      />
    </div>
  );
}
