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

interface EmbeddingModelDialogProps {
  open: boolean;
  initialModel?: LLMModel | null;
  onSubmit: () => void;
  onOpenChange: (open: boolean) => void;
}

/**
 * 嵌入模型专属弹窗：字段比会话模型少（无 provider 选择、无上下文窗口/最大输出），
 * 调用名称跟随显示名称，provider 固定为「自定义」。
 */
export function EmbeddingModelDialog({
  open,
  initialModel,
  onSubmit,
  onOpenChange,
}: EmbeddingModelDialogProps) {
  const { t } = useTranslation();
  const isEditing = initialModel != null;
  const [modelName, setModelName] = useState(initialModel?.modelName ?? "");
  const [baseUrl, setBaseUrl] = useState(initialModel?.baseUrl ?? "");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);

  const createMutation = useCreateModel();
  const updateMutation = useUpdateModel();
  const isPending = createMutation.isPending || updateMutation.isPending;
  const canSave = Boolean(modelName.trim() && baseUrl.trim() && (isEditing || apiKey.trim()));

  function handleSubmit() {
    if (isEditing) {
      updateMutation.mutate(
        {
          id: initialModel!.id,
          type: "embedding",
          provider: initialModel!.provider,
          modelName,
          modelId: modelName,
          baseUrl,
          apiKey,
        },
        {
          onSuccess: () => {
            toast.add({ title: t("settings.embeddingModelSaved"), type: "success" });
            onSubmit();
          },
          // 错误由 apiFetch toast 统一提示，避免重复
        },
      );
    } else {
      createMutation.mutate(
        {
          type: "embedding",
          provider: "自定义",
          modelName,
          modelId: modelName,
          baseUrl,
          apiKey,
        },
        {
          onSuccess: () => {
            toast.add({ title: t("settings.embeddingModelSaved"), type: "success" });
            onSubmit();
          },
          // 错误由 apiFetch toast 统一提示，避免重复
        },
      );
    }
  }

  function handleClose() {
    onOpenChange(false);
    setModelName("");
    setBaseUrl("");
    setApiKey("");
    setShowKey(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) handleClose();
      }}
    >
      <DialogContent className="max-w-[520px] gap-0 overflow-hidden rounded-lg bg-editorial-surface-card p-0 text-editorial-ink">
        <DialogHeader className="border-b border-editorial-hairline px-5 py-4">
          <DialogTitle className="text-sm font-semibold">
            {isEditing ? t("settings.editModel") : t("settings.addModel")}
          </DialogTitle>
          <DialogDescription className="text-xs text-editorial-ink-muted">
            {t("settings.embeddingModelDesc")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 px-5 py-5">
          <div>
            <label
              htmlFor="embedding-model-name-input"
              className="mb-1.5 block text-xs font-medium text-editorial-ink-soft"
            >
              {t("settings.embeddingModelName")}
            </label>
            <Input
              id="embedding-model-name-input"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              placeholder="BAAI/bge-m3"
              className="h-10 rounded-md border-editorial-hairline text-body"
            />
          </div>
          <div>
            <label
              htmlFor="embedding-endpoint-input"
              className="mb-1.5 block text-xs font-medium text-editorial-ink-soft"
            >
              {t("settings.endpointLabel")}
            </label>
            <Input
              id="embedding-endpoint-input"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.siliconflow.cn/v1"
              className="h-10 rounded-md border-editorial-hairline text-body"
            />
          </div>
          <div>
            <label
              htmlFor="embedding-api-key-input"
              className="mb-1.5 block text-xs font-medium text-editorial-ink-soft"
            >
              {t("settings.apiKeyLabel")}
            </label>
            <div className="relative">
              <Input
                id="embedding-api-key-input"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={
                  isEditing
                    ? t("settings.apiKeyPlaceholderEdit")
                    : t("settings.apiKeyPlaceholderNew")
                }
                type={showKey ? "text" : "password"}
                className="h-10 rounded-md border-editorial-hairline pr-10 text-body"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-editorial-ink-muted hover:bg-editorial-surface-soft hover:text-editorial-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editorial-primary/30"
                aria-label={showKey ? t("settings.hideKey") : t("settings.showKey")}
                title={showKey ? t("settings.hideKey") : t("settings.showKey")}
              >
                {showKey ? (
                  <EyeOff size={15} strokeWidth={1.7} />
                ) : (
                  <Eye size={15} strokeWidth={1.7} />
                )}
              </button>
            </div>
          </div>
        </div>
        <DialogFooter className="mx-0 mb-0 border-t border-editorial-hairline bg-editorial-surface-card px-5 py-4">
          <Button onClick={handleClose} variant="ghost" className="px-4 text-body">
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSave || isPending}
            className="px-4 text-body"
          >
            {isEditing ? t("settings.saveEdit") : t("settings.addModel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
