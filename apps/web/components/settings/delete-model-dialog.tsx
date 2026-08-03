"use client";

import { useTranslation } from "react-i18next";

import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { toast } from "@/components/ui/toast";
import { useDeleteModel } from "@/lib/hooks/use-models";
import type { LLMModel } from "@/lib/types";

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
        toast.add({ title: t("settings.modelDeleted"), type: "success" });
      },
      onError: () => toast.add({ title: t("settings.modelDeleteFailed"), type: "error" }),
    });
  }

  return (
    <DeleteConfirmDialog
      open={model != null}
      onClose={onClose}
      onConfirm={handleDelete}
      confirming={deleteMutation.isPending}
      title={t("settings.deleteModel")}
      description={
        <>
          {t("settings.confirmDeleteModel", { modelName: model?.modelName })}
          <br />
          {t("settings.deleteModelDesc")}
        </>
      }
      confirmLabel={t("settings.confirmDelete")}
    />
  );
}
