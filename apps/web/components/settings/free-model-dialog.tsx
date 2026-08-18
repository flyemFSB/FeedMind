"use client";

import { useState } from "react";
import { Check, ExternalLink, Eye, EyeOff, Sparkles } from "lucide-react";
import { toast } from "@/components/ui/toast";
import type { FreeModelPreset } from "@/lib/constants/free-models";
import { useCreateModel, useSetSelectedModel } from "@/lib/hooks/use-models";
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

interface FreeModelDialogProps {
  open: boolean;
  preset: FreeModelPreset;
  onClose: () => void;
}

/** 免费模型接入流程：引导获取 API Key → 粘贴 → 一键创建并选中 */
export function FreeModelDialog({ open, preset, onClose }: FreeModelDialogProps) {
  const { t } = useTranslation();
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);

  const createMutation = useCreateModel();
  const setSelected = useSetSelectedModel(preset.type);

  async function handleAdd() {
    if (!apiKey.trim()) {
      toast.add({ title: t("settings.freeModelKeyRequired"), type: "error" });
      return;
    }
    try {
      const created = await createMutation.mutateAsync({
        type: preset.type,
        provider: preset.provider,
        modelName: preset.modelName,
        modelId: preset.modelId,
        baseUrl: preset.baseUrl,
        apiKey: apiKey.trim(),
        contextWindow: null,
        maxOutput: null,
      });
      await setSelected.mutateAsync(created.id);
      toast.add({ title: t("settings.modelAdded"), type: "success" });
      setApiKey("");
      setShowKey(false);
      onClose();
    } catch {
      // 错误由 apiFetch toast 统一提示，避免重复
    }
  }

  const isOcr = preset.type === "ocr";
  const keyTerm = isOcr ? t("settings.ocrToken") : t("settings.apiKeyLabel");

  const steps = [
    {
      key: "step1",
      text: (
        <span className="flex items-center gap-1">
          {isOcr
            ? `前往 ${preset.provider} 获取 ${keyTerm}：`
            : t("settings.freeModelStepGetKey", { provider: preset.provider })}
          <a
            href={preset.signupUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 text-editorial-accent underline decoration-editorial-accent/40 underline-offset-2 hover:decoration-editorial-accent"
          >
            {preset.signupUrl.replace(/^https?:\/\//, "")}
            <ExternalLink size={11} />
          </a>
        </span>
      ),
    },
    {
      key: "step2",
      text: isOcr ? `将 ${keyTerm} 粘贴到下方输入框` : t("settings.freeModelStepPaste"),
    },
    { key: "step3", text: t("settings.freeModelStepFinish") },
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setApiKey("");
          setShowKey(false);
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-[460px] gap-0 overflow-hidden rounded-lg bg-editorial-surface-card p-0 text-editorial-ink">
        <DialogHeader className="border-b border-editorial-hairline px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles size={15} className="text-editorial-accent" />
            {t("settings.addFreeModel")}
          </DialogTitle>
          <DialogDescription className="mt-1 text-xs leading-relaxed text-editorial-ink-muted">
            {preset.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-5 py-5">
          <ol className="space-y-2">
            {steps.map((step, i) => (
              <li
                key={step.key}
                className="flex items-start gap-2.5 text-body text-editorial-ink-soft"
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-editorial-accent-soft text-tiny font-semibold text-editorial-accent">
                  {i + 1}
                </span>
                <span className="min-w-0">{step.text}</span>
              </li>
            ))}
          </ol>

          <div className="rounded-md bg-editorial-surface-soft px-3 py-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-editorial-ink-muted">{t("settings.endpointLabel")}</span>
              <code className="truncate font-mono text-editorial-ink">{preset.baseUrl}</code>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs">
              <span className="text-editorial-ink-muted">{t("settings.tableModel")}</span>
              <code className="truncate font-mono text-editorial-ink">{preset.modelName}</code>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-editorial-ink-soft">
              {keyTerm}
            </label>
            <div className="relative">
              <Input
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                type={showKey ? "text" : "password"}
                placeholder={
                  isOcr
                    ? t("settings.ocrTokenPlaceholder", "输入 Access Token")
                    : t("settings.apiKeyPlaceholderNew")
                }
                className="h-10 rounded-md border-editorial-hairline pr-10 text-body"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-editorial-ink-muted hover:bg-editorial-surface-soft hover:text-editorial-ink"
                aria-label={showKey ? t("settings.hideKey") : t("settings.showKey")}
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
          <Button onClick={onClose} variant="ghost" className="px-4 text-body">
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() => void handleAdd()}
            disabled={createMutation.isPending || !apiKey.trim()}
            className="flex items-center gap-1.5 px-4 text-body"
          >
            {createMutation.isPending ? (
              <span className="size-3.5 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />
            ) : (
              <Check size={14} />
            )}
            <span>{t("settings.addModel")}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
