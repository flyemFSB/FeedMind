import { useState } from "react";

import { useChatContext } from "@/app/agent-drawer/chat-context";
import { useDeleteChatSession } from "@/lib/hooks/use-chats";

/**
 * 会话删除确认的共享逻辑：删除目标状态 + 确认/关闭处理。
 * agent-drawer 等消费方复用，避免各自维护一份。
 */
export function useChatSessionDelete() {
  const { clearSession, activeThreadId } = useChatContext();
  const deleteMutation = useDeleteChatSession();
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const handleClose = () => setDeleteTarget(null);

  const handleConfirm = () => {
    if (!deleteTarget) return;
    // 删除当前会话时先清空界面状态，避免残留消息
    if (deleteTarget === activeThreadId) clearSession();
    deleteMutation.mutate(deleteTarget);
    setDeleteTarget(null);
  };

  return {
    deleteTarget,
    setDeleteTarget,
    handleClose,
    handleConfirm,
  };
}
