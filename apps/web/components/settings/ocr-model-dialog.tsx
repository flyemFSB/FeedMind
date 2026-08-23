import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "@/components/ui/toast";
import type { LLMModel } from "@/lib/types";
import { useCreateModel, useUpdateModel } from "@/lib/hooks/use-models";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslation } from "react-i18next";

interface OcrModelDialogProps {
  open: boolean;
  initialModel?: LLMModel | null;
  onSubmit: () => void;
  onOpenChange: (open: boolean) => void;
}

/**
 * OCR 模型专属弹窗：配置 PaddleOCR 官方 API 的 Access Token。
 * 端点留空时使用官方默认地址（paddleocr.aistudio-app.com）。
 */
export function OcrModelDialog({
  open,
  initialModel,
  onSubmit,
  onOpenChange,
}: OcrModelDialogProps) {
  const { t } = useTranslation();
  const isEditing = initialModel != null;
  const [modelName, setModelName] = useState(initialModel?.modelName ?? "PaddleOCR-VL-1.6");
  const [baseUrl, setBaseUrl] = useState(initialModel?.baseUrl ?? "");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);

  const createMutation = useCreateModel();
  const updateMutation = useUpdateModel();
  const isPending = createMutation.isPending || updateMutation.isPending;
  const canSave = Boolean(modelName.trim() && (isEditing || apiKey.trim()));

  function handleSubmit() {
    const trimmedName = modelName.trim() || "PaddleOCR-VL-1.6";
    const payload = {
      type: "ocr" as const,
      provider: "PaddleOCR",
      modelName: trimmedName,
      modelId: trimmedName,
      baseUrl: (baseUrl.trim() || "https://paddleocr.aistudio-app.com").replace(/\/+$/, ""),
      apiKey: apiKey.trim(),
    };
    const onSuccess = () => {
      toast.add({ title: t("settings.ocrModelSaved"), type: "success" });
      onSubmit();
    };
    if (isEditing) {
      updateMutation.mutate({ id: initialModel!.id, ...payload }, { onSuccess });
    } else {
      createMutation.mutate(payload, { onSuccess });
    }
  }

  function handleClose() {
    onOpenChange(false);
    setApiKey("");
    setShowKey(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) handleClose();
      }}
    >
      <DialogContent className="max-w-md rounded-xl border border-editorial-hairline bg-editorial-surface-card p-5 shadow-lg">
        <DialogHeader className="gap-1 pb-3">
          <DialogTitle className="text-base font-semibold text-editorial-ink">
            {isEditing ? t("settings.editOcrModel") : t("settings.addOcrModel")}
          </DialogTitle>
          <DialogDescription className="text-xs text-editorial-ink-muted">
            {t("settings.ocrModelDesc")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3.5 py-1 text-sm">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-editorial-ink-soft">
              {t("settings.ocrModelName")}
            </label>
            <Input
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              placeholder="PaddleOCR-VL-1.6"
              className="h-9 border-editorial-hairline-strong bg-editorial-surface-card px-3 text-sm outline-none focus:border-editorial-accent focus:ring-2 focus:ring-editorial-accent-soft"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-editorial-ink-soft">
              {t("settings.ocrEndpoint")}
            </label>
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://paddleocr.aistudio-app.com"
              className="h-9 border-editorial-hairline-strong bg-editorial-surface-card px-3 text-sm outline-none focus:border-editorial-accent focus:ring-2 focus:ring-editorial-accent-soft"
            />
            <p className="text-tiny text-editorial-ink-muted">{t("settings.ocrEndpointHint")}</p>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-editorial-ink-soft">
              {t("settings.ocrToken")}
            </label>
            <div className="flex gap-2">
              <Input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={isEditing ? t("settings.keyPlaceholder") : ""}
                className="h-9 flex-1 border-editorial-hairline-strong bg-editorial-surface-card px-3 text-sm outline-none focus:border-editorial-accent focus:ring-2 focus:ring-editorial-accent-soft"
              />
              <Button
                variant="ghost"
                size="icon"
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="h-9 w-9 shrink-0 text-editorial-ink-muted"
                title={showKey ? t("settings.hideKey") : t("settings.showKey")}
              >
                {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 pt-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClose}
            className="text-xs text-editorial-ink-muted"
          >
            {t("common.cancel")}
          </Button>
          <Button
            size="sm"
            onClick={() => void handleSubmit()}
            disabled={!canSave || isPending}
            className="h-8 px-4 text-xs"
          >
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
