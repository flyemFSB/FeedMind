import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "@/components/ui/toast";
import type { LLMModel } from "@/lib/types";
import { useCreateModel, useUpdateModel } from "@/lib/hooks/use-models";
import {
  PROVIDER_MODELS,
  CUSTOM_PROVIDER,
  lookupModelInfo,
  displayNameToModelId,
  formatModelDisplayName,
  formatKB,
} from "@/lib/constants/provider-models";
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
  "Gemini",
  "GLM",
  "Kimi",
  "MiniMax",
  "Qwen",
  "自定义",
] as const;

const EMPTY_FORM = {
  provider: "ChatGPT",
  modelName: "",
  modelId: "",
  baseUrl: "",
  apiKey: "",
  context: "256",
  maxOutput: "64",
};

interface ModelFormDialogProps {
  open: boolean;
  initialModel?: LLMModel | null;
  onSubmit: () => void;
  onOpenChange: (open: boolean) => void;
}

function ModelSpecBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded bg-editorial-surface-soft px-1.5 py-0.5 text-xs font-medium text-editorial-ink-muted leading-none">
      {label}
    </span>
  );
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
          modelId: initialModel.modelId ?? displayNameToModelId(initialModel.modelName),
          baseUrl: initialModel.baseUrl,
          apiKey: "",
          context: initialModel.contextWindow ?? "256",
          maxOutput: initialModel.maxOutput ?? "64",
        }
      : EMPTY_FORM,
  );
  const [showKey, setShowKey] = useState(false);

  const createMutation = useCreateModel();
  const updateMutation = useUpdateModel();
  const isPending = createMutation.isPending || updateMutation.isPending;

  const isCustom = form.provider === CUSTOM_PROVIDER;
  const modelList = !isCustom ? (PROVIDER_MODELS[form.provider] ?? []) : [];
  function handleProviderChange(value: string | null) {
    if (!value) return;
    const isNewCustom = value === CUSTOM_PROVIDER;
    setForm((current) => ({
      ...current,
      provider: value,
      modelName: "",
      modelId: "",
      context: isNewCustom ? "256" : "",
      maxOutput: isNewCustom ? "64" : "",
    }));
  }

  function handleModelChange(value: string | null) {
    if (!value) return;
    const info = lookupModelInfo(form.provider, value);
    setForm((current) => ({
      ...current,
      modelName: value,
      modelId: info?.modelId ?? displayNameToModelId(value),
      context: info?.context ?? "256",
      maxOutput: info?.maxOutput ?? "64",
    }));
  }

  function handleSubmit() {
    const payload = {
      provider: form.provider,
      modelName: form.modelName,
      modelId: form.modelId,
      baseUrl: form.baseUrl,
      apiKey: form.apiKey,
      contextWindow: form.context || null,
      maxOutput: form.maxOutput || null,
    };

    if (isEditing) {
      updateMutation.mutate(
        { id: initialModel!.id, ...payload },
        {
          onSuccess: () => {
            toast.add({ title: t("settings.modelUpdated"), type: "success" });
            onSubmit();
          },
          // 错误由 apiFetch toast 统一提示，避免重复
        },
      );
    } else {
      createMutation.mutate(payload, {
        onSuccess: () => {
          toast.add({ title: t("settings.modelAdded"), type: "success" });
          onSubmit();
        },
        // 错误由 apiFetch toast 统一提示，避免重复
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
      <DialogContent className="max-w-[520px] gap-0 overflow-hidden rounded-lg bg-editorial-surface-card p-0 text-editorial-ink">
        <DialogHeader className="border-b border-editorial-hairline px-5 py-4">
          <DialogTitle className="text-sm font-semibold">
            {isEditing ? t("settings.editModel") : t("settings.addModel")}
          </DialogTitle>
          <DialogDescription className="text-xs text-editorial-ink-muted">
            {t("settings.formDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 px-5 py-5">
          <div className="col-span-2">
            <label
              htmlFor="model-provider-select"
              className="mb-1.5 block text-xs font-medium text-editorial-ink-soft"
            >
              {t("settings.provider")}
            </label>
            <div className="grid grid-cols-[40px_minmax(0,1fr)] items-center gap-2">
              <div className="grid h-10 w-10 place-items-center rounded-lg border border-editorial-hairline bg-editorial-canvas-soft">
                <ProviderIcon provider={form.provider} size={24} />
              </div>
              <Select value={form.provider} onValueChange={handleProviderChange}>
                <SelectTrigger
                  id="model-provider-select"
                  aria-label={t("settings.selectProvider")}
                  className="h-10 min-h-10 w-full rounded-md border-editorial-hairline bg-editorial-surface-card px-3 py-0 text-body"
                >
                  <SelectValue placeholder={t("settings.selectProvider")} />
                </SelectTrigger>
                <SelectContent className="rounded-md border-editorial-hairline">
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
          {/* 模型调用名称 */}
          <div className="col-span-2">
            <label
              htmlFor="model-api-id-input"
              className="mb-1.5 block text-xs font-medium text-editorial-ink-soft"
            >
              模型调用名称
            </label>
            {isCustom ? (
              <Input
                id="model-api-id-input"
                value={form.modelId}
                onChange={(event) => {
                  const val = event.target.value;
                  const autoDisplayName = formatModelDisplayName(val);
                  setForm((current) => ({
                    ...current,
                    modelId: val,
                    modelName: autoDisplayName,
                  }));
                }}
                placeholder="例如 deepseek-v4-flash"
                className="h-10 rounded-md border-editorial-hairline text-body"
              />
            ) : (
              <Input
                id="model-api-id-input"
                value={form.modelId}
                onChange={(event) =>
                  setForm((current) => ({ ...current, modelId: event.target.value }))
                }
                placeholder="例如 deepseek-v4-flash"
                className="h-10 rounded-md border-editorial-hairline text-body"
              />
            )}
          </div>
          {/* 模型显示名称 */}
          <div className="col-span-2">
            <label
              htmlFor="model-name-input"
              className="mb-1.5 block text-xs font-medium text-editorial-ink-soft"
            >
              模型显示名称
            </label>
            {isCustom ? (
              <Input
                id="model-name-input"
                value={form.modelName}
                onChange={(event) => {
                  setForm((current) => ({ ...current, modelName: event.target.value }));
                }}
                placeholder="根据调用名称自动生成"
                className="h-10 rounded-md border-editorial-hairline text-body"
              />
            ) : (
              <Select value={form.modelName} onValueChange={handleModelChange}>
                <SelectTrigger
                  id="model-name-select"
                  aria-label={t("settings.selectModel")}
                  className="h-10 min-h-10 w-full rounded-md border-editorial-hairline bg-editorial-surface-card px-3 py-0 text-body"
                >
                  <SelectValue placeholder={t("settings.selectModel")} />
                </SelectTrigger>
                <SelectContent className="rounded-md border-editorial-hairline">
                  <SelectGroup>
                    {modelList.length > 0 ? (
                      modelList.map((model) => (
                        <SelectItem key={model.name} value={model.name}>
                          <span className="flex items-center gap-2">
                            <span className="text-body">{model.name}</span>
                            <span className="flex items-center gap-1">
                              <ModelSpecBadge label={formatKB(model.context)} />
                              <ModelSpecBadge label={formatKB(model.maxOutput)} />
                            </span>
                          </span>
                        </SelectItem>
                      ))
                    ) : (
                      <div className="px-3 py-2 text-xs text-editorial-ink-muted">
                        {t("settings.noModelsAvailable")}
                      </div>
                    )}
                  </SelectGroup>
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="col-span-2">
            <label
              htmlFor="model-endpoint-input"
              className="mb-1.5 block text-xs font-medium text-editorial-ink-soft"
            >
              {t("settings.endpointLabel")}
            </label>
            <Input
              id="model-endpoint-input"
              value={form.baseUrl}
              onChange={(event) =>
                setForm((current) => ({ ...current, baseUrl: event.target.value }))
              }
              placeholder={t("settings.endpointPlaceholder")}
              className="h-10 rounded-md border-editorial-hairline text-body"
            />
          </div>
          <div className="col-span-2">
            <label
              htmlFor="model-api-key-input"
              className="mb-1.5 block text-xs font-medium text-editorial-ink-soft"
            >
              {t("settings.apiKeyLabel")}
            </label>
            <div className="relative">
              <Input
                id="model-api-key-input"
                value={form.apiKey}
                onChange={(event) =>
                  setForm((current) => ({ ...current, apiKey: event.target.value }))
                }
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
                onClick={() => setShowKey((value) => !value)}
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
          <div className="col-span-2 grid grid-cols-[3fr_2fr] gap-3">
            <div>
              <label
                htmlFor="model-context-input"
                className="mb-1.5 block text-xs font-medium text-editorial-ink-soft"
              >
                {t("settings.contextWindow")}
              </label>
              <Input
                id="model-context-input"
                type="number"
                value={form.context}
                onChange={(event) =>
                  setForm((current) => ({ ...current, context: event.target.value }))
                }
                placeholder={t("settings.contextWindowPlaceholder")}
                className="h-10 rounded-md border-editorial-hairline text-body"
              />
            </div>
            <div>
              <label
                htmlFor="model-max-output-input"
                className="mb-1.5 block text-xs font-medium text-editorial-ink-soft"
              >
                {t("settings.maxOutput")}
              </label>
              <Input
                id="model-max-output-input"
                type="number"
                value={form.maxOutput}
                onChange={(event) =>
                  setForm((current) => ({ ...current, maxOutput: event.target.value }))
                }
                placeholder={t("settings.maxOutputPlaceholder")}
                className="h-10 rounded-md border-editorial-hairline text-body"
              />
            </div>
          </div>
        </div>
        <DialogFooter className="mx-0 mb-0 border-t border-editorial-hairline bg-editorial-surface-card px-5 py-4">
          <Button onClick={handleClose} variant="ghost" className="px-4 text-body">
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!form.modelName || isPending}
            className="px-4 text-body"
          >
            {isEditing ? t("settings.saveEdit") : t("settings.addModel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
