"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import type { LLMModel } from "@/lib/types";
import { useCreateLLMModel, useUpdateLLMModel } from "@/lib/hooks/use-llms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ProviderIcon } from "@/components/settings/provider-icon";
import { useTranslation } from "react-i18next";

const PROVIDERS = [
  "ChatGPT",
  "Claude",
  "DeepSeek",
  "Doubao",
  "Gemini",
  "GLM",
  "Grok",
  "Kimi",
  "MiniMax",
  "Qwen",
  "自定义",
] as const;
const EMPTY_FORM = { provider: "ChatGPT", modelName: "", baseUrl: "", apiKey: "" };

interface ModelFormDialogProps {
  open: boolean;
  initialModel?: LLMModel | null;
  onSubmit: () => void;
  onOpenChange: (open: boolean) => void;
}

export function ModelFormDialog({
  open,
  initialModel,
  onSubmit,
  onOpenChange,
}: ModelFormDialogProps) {
  const { t } = useTranslation();
  const isEditing = initialModel != null;
  const [form, setForm] = useState(
    initialModel
      ? {
          provider: initialModel.provider,
          modelName: initialModel.modelName,
          baseUrl: initialModel.baseUrl,
          apiKey: "",
        }
      : EMPTY_FORM,
  );
  const [showKey, setShowKey] = useState(false);

  const createMutation = useCreateLLMModel();
  const updateMutation = useUpdateLLMModel();
  const isPending = createMutation.isPending || updateMutation.isPending;

  function handleSubmit() {
    if (isEditing) {
      updateMutation.mutate(
        { id: initialModel!.id, ...form },
        {
          onSuccess: () => {
            toast.success(t("settings.modelUpdated"));
            onSubmit();
          },
          onError: () => toast.error(t("settings.modelUpdateFailed")),
        },
      );
    } else {
      createMutation.mutate(form, {
        onSuccess: () => {
          toast.success(t("settings.modelAdded"));
          onSubmit();
        },
        onError: () => toast.error(t("settings.modelAddFailed")),
      });
    }
  }

  function handleClose() {
    onOpenChange(false);
    setForm(EMPTY_FORM);
    setShowKey(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) handleClose();
      }}
    >
      <DialogContent className="max-w-[520px] gap-0 rounded-2xl bg-white p-0 text-editorial-ink">
        <DialogHeader className="border-b border-editorial-hairline px-5 py-4">
          <DialogTitle className="text-[15px] font-semibold">
            {isEditing ? t("settings.editModel") : t("settings.addModel")}
          </DialogTitle>
          <DialogDescription className="text-[12px] text-editorial-ink-muted">
            {t("settings.formDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 px-5 py-5">
          <div className="col-span-2">
            <label className="mb-1.5 block text-[12px] font-medium text-editorial-ink-soft">{t("settings.provider")}</label>
            <div className="grid grid-cols-[40px_minmax(0,1fr)] items-center gap-2">
              <div className="grid h-10 w-10 place-items-center rounded-xl border border-editorial-hairline bg-editorial-canvas-soft">
                <ProviderIcon provider={form.provider} size={24} />
              </div>
              <Select
                value={form.provider}
                onValueChange={(value) => {
                  if (value) setForm((current) => ({ ...current, provider: value }));
                }}
              >
                <SelectTrigger
                  aria-label={t("settings.selectProvider")}
                  className="h-10 min-h-10 w-full rounded-xl border-editorial-hairline bg-white px-3 py-0 text-[13px]"
                >
                  <SelectValue placeholder={t("settings.selectProvider")} />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-editorial-hairline">
                  <SelectGroup>
                    {PROVIDERS.map((provider) => (
                      <SelectItem key={provider} value={provider}>
                        <span className="flex items-center gap-2">
                          <ProviderIcon provider={provider} size={18} />
                          <span>{provider}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="col-span-2">
            <label className="mb-1.5 block text-[12px] font-medium text-editorial-ink-soft">{t("settings.modelName")}</label>
            <Input
              value={form.modelName}
              onChange={(event) =>
                setForm((current) => ({ ...current, modelName: event.target.value }))
              }
              placeholder={t("settings.modelNamePlaceholder")}
              className="h-10 rounded-xl border-editorial-hairline text-[13px]"
            />
          </div>
          <div className="col-span-2">
            <label className="mb-1.5 block text-[12px] font-medium text-editorial-ink-soft">
              {t("settings.endpointLabel")}
            </label>
            <Input
              value={form.baseUrl}
              onChange={(event) =>
                setForm((current) => ({ ...current, baseUrl: event.target.value }))
              }
              placeholder={t("settings.endpointPlaceholder")}
              className="h-10 rounded-xl border-editorial-hairline text-[13px]"
            />
          </div>
          <div className="col-span-2">
            <label className="mb-1.5 block text-[12px] font-medium text-editorial-ink-soft">
              {t("settings.apiKeyLabel")}
            </label>
            <div className="relative">
              <Input
                value={form.apiKey}
                onChange={(event) =>
                  setForm((current) => ({ ...current, apiKey: event.target.value }))
                }
                placeholder={isEditing ? t("settings.apiKeyPlaceholderEdit") : t("settings.apiKeyPlaceholderNew")}
                type={showKey ? "text" : "password"}
                className="h-10 rounded-xl border-editorial-hairline pr-10 text-[13px]"
              />
              <button
                type="button"
                onClick={() => setShowKey((value) => !value)}
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-editorial-ink-muted transition-colors hover:bg-editorial-surface-soft hover:text-editorial-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editorial-primary/30"
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
        <DialogFooter className="mx-0 mb-0 rounded-b-2xl border-t border-editorial-hairline bg-editorial-canvas-soft px-5 py-4">
          <Button onClick={handleClose} variant="ghost" className="rounded-xl px-4 text-[13px]">
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!form.modelName || isPending}
            className="rounded-xl bg-editorial-primary px-4 text-[13px] text-white hover:bg-editorial-primary disabled:cursor-not-allowed disabled:bg-editorial-hairline"
          >
            {isEditing ? t("settings.saveEdit") : t("settings.addModel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
