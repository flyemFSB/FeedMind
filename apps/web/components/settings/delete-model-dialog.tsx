"use client";

import { toast } from "sonner";
import type { LLMModel } from "@/lib/types";
import { deleteLLMModel } from "@/lib/api/llms";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface DeleteModelDialogProps {
  model: LLMModel | null;
  onClose: () => void;
  onDeleted: () => void;
}

export function DeleteModelDialog({ model, onClose, onDeleted }: DeleteModelDialogProps) {
  function handleDelete() {
    if (!model) return;
    deleteLLMModel(model.id)
      .then(() => {
        onDeleted();
        toast.success("模型已删除");
      })
      .catch(() => {
        toast.error("删除失败");
      });
  }

  return (
    <Dialog
      open={model != null}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <DialogContent className="max-w-[420px] gap-0 rounded-2xl bg-white p-0 text-[#1d1d1f]">
        <DialogHeader className="border-b border-[#d2d2d7] px-5 py-4">
          <DialogTitle className="text-[15px] font-semibold">删除模型</DialogTitle>
          <DialogDescription className="text-[12px] text-[#86868b]">
            删除后该模型将从配置列表中移除。
          </DialogDescription>
        </DialogHeader>
        <div className="px-5 py-5 text-[13px] text-[#1d1d1f]">
          确认删除模型 {model?.modelName} 吗？
        </div>
        <DialogFooter className="mx-0 mb-0 rounded-b-2xl border-t border-[#d2d2d7] bg-[#fbfbfd] px-5 py-4">
          <Button onClick={onClose} variant="ghost" className="rounded-xl px-4 text-[13px]">
            取消
          </Button>
          <Button
            onClick={handleDelete}
            className="rounded-xl bg-red-500 px-4 text-[13px] text-white hover:bg-red-600"
          >
            确认删除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
