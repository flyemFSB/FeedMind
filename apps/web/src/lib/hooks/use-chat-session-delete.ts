import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useChatContext } from "@/app/agent-drawer/chat-context";
import { useDeleteChatSession } from "@/lib/hooks/use-chats";
import { toast } from "@/components/ui/toast";

/**
 * 会话删除确认的共享逻辑：删除目标状态 + 确认/关闭处理。
 * agent-drawer 等消费方复用，避免各自维护一份。
 */
export function useChatSessionDelete() {
  const { t } = useTranslation();
  const { clearSession, activeThreadId } = useChatContext();
  const deleteMutation = useDeleteChatSession();
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const handleClose = () => {
    if (deleteMutation.isPending) return;
    setDeleteTarget(null);
  };

  const handleConfirm = () => {
    if (!deleteTarget || deleteMutation.isPending) return;
    const targetId = deleteTarget;
    deleteMutation.mutate(targetId, {
      onSuccess: () => {
        // 删除当前会话时先清空界面状态，避免残留消息
        if (targetId === activeThreadId) clearSession();
        setDeleteTarget(null);
        toast.add({
          title: t("chat.sessionDeleted", "会话已删除"),
          type: "success",
        });
      },
      // 错误由 apiFetch 统一 toast 处理，保留弹窗以便重试
    });
  };

  return {
    deleteTarget,
    setDeleteTarget,
    handleClose,
    handleConfirm,
    isDeleting: deleteMutation.isPending,
  };
}
