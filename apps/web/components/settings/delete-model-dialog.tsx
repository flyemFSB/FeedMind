"use client";

import { toast } from "sonner";
import type { LLMModel } from "@/lib/types";
import { useDeleteModel } from "@/lib/hooks/use-models";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslation } from "react-i18next";

interface DeleteModelDialogProps {
  model: LLMModel | null;
  onClose: () => void;
  onDeleted: () => void;
}

export function DeleteModelDialog({ model, onClose, onDeleted }: DeleteModelDialogProps) {
  const { t } = useTranslation();
  const deleteMutation = useDeleteModel();

  function handleDelete() {
    if (!model) return;
    deleteMutation.mutate(model.id, {
      onSuccess: () => {
        onDeleted();
        toast.success(t("settings.modelDeleted"));
      },
      onError: () => toast.error(t("settings.modelDeleteFailed")),
    });
  }

  return (
    <Dialog
      open={model != null}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <DialogContent className="max-w-[420px] gap-0 rounded-lg bg-editorial-surface-card p-0 text-editorial-ink">
        <DialogHeader className="border-b border-editorial-hairline px-5 py-4">
          <DialogTitle className="text-[14px] font-semibold">
            {t("settings.deleteModel")}
          </DialogTitle>
          <DialogDescription className="text-[12px] text-editorial-ink-muted">
            {t("settings.deleteModelDesc")}
          </DialogDescription>
        </DialogHeader>
        <div className="px-5 py-5 text-[13px] text-editorial-ink">
          {t("settings.confirmDeleteModel", { modelName: model?.modelName })}
        </div>
        <DialogFooter className="mx-0 mb-0 rounded-b-lg border-t border-editorial-hairline bg-editorial-canvas-soft px-5 py-4">
          <Button onClick={onClose} variant="ghost" className="px-4 text-[13px]">
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            className="bg-destructive px-4 text-[13px] text-destructive-foreground hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("settings.confirmDelete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
