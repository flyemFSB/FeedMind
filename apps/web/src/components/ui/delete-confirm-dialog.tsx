import type { ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { MotionSpinner } from "@/components/ui/motion-spinner";
import { cn } from "@/lib/utils";

interface DeleteConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: ReactNode;
  cancelLabel?: ReactNode;
  /** 异步确认中，禁用按钮并显示 spinner */
  confirming?: boolean;
}

/**
 * 删除/危险操作的统一确认弹窗。
 * 结构参考 shadcn AlertDialog：图标徽标 + 标题 + 描述 + 取消/危险操作按钮，
 * 基于 Base UI Dialog 封装，复用既有动画与焦点管理。
 */
export function DeleteConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  cancelLabel,
  confirming = false,
}: DeleteConfirmDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="max-w-[400px] gap-0 overflow-hidden rounded-lg bg-editorial-surface-card p-0 text-editorial-ink"
      >
        <div className="flex flex-col gap-2.5 px-5 pt-5">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-editorial-semantic-error/10 text-editorial-semantic-error">
              <Trash2 size={15} />
            </span>
            <DialogTitle className="pt-1 text-sm font-semibold leading-snug text-editorial-ink">
              {title}
            </DialogTitle>
          </div>
          {description && (
            <DialogDescription className="text-xs leading-relaxed text-editorial-ink/75">
              {description}
            </DialogDescription>
          )}
        </div>
        <DialogFooter className="mx-0 mb-0 mt-5 rounded-b-lg border-t border-editorial-hairline bg-editorial-canvas-soft px-5 py-4">
          <Button onClick={onClose} variant="ghost" className="px-4 text-body">
            {cancelLabel ?? t("common.cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={confirming}
            className="relative px-4 text-body disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className={cn(confirming && "opacity-0")}>
              {confirmLabel ?? t("common.delete")}
            </span>
            {confirming && (
              <span className="absolute inset-0 flex items-center justify-center">
                <MotionSpinner size={14} />
              </span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
