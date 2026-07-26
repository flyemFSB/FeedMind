"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, Save } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useModels, useSetSelectedModel } from "@/lib/hooks/use-models";
import { useTranslation } from "react-i18next";

export function EmbeddingModelSection() {
  const { t } = useTranslation();
  const { data: embeddingModels = [] } = useModels("embedding");
  const setSelected = useSetSelectedModel("embedding");

  const existingModel = embeddingModels.length > 0 ? embeddingModels[0] : null;

  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [modelName, setModelName] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (existingModel) {
      setBaseUrl(existingModel.baseUrl);
      setModelName(existingModel.modelName);
    }
  }, [existingModel]);

  async function handleSave() {
    if (!baseUrl || !apiKey || !modelName) {
      toast.error(t("settings.embeddingFormIncomplete"));
      return;
    }
    setSaving(true);
    try {
      const { createModel, updateModel } = await import("@/lib/api/models");
      if (existingModel) {
        await updateModel(existingModel.id, {
          type: "embedding",
          provider: "自定义",
          modelName,
          modelId: modelName,
          baseUrl,
          apiKey,
        });
        await setSelected.mutateAsync(existingModel.id);
      } else {
        const created = await createModel({
          type: "embedding",
          provider: "自定义",
          modelName,
          modelId: modelName,
          baseUrl,
          apiKey,
        });
        await setSelected.mutateAsync(created.id);
      }
      toast.success(t("settings.embeddingModelSaved"));
    } catch (err) {
      toast.error(t("settings.embeddingModelSaveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-editorial-hairline p-5">
      <div>
        <h3 className="text-[14px] font-semibold text-editorial-ink">
          {t("settings.embeddingModels")}
        </h3>
        <p className="mt-0.5 text-[12px] text-editorial-ink-muted">
          {t("settings.embeddingModelsDescription")}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1.5 block text-[12px] font-medium text-editorial-ink-soft">
            {t("settings.endpointLabel")}
          </label>
          <Input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.openai.com/v1"
            className="h-10 rounded-md border-editorial-hairline text-[13px]"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[12px] font-medium text-editorial-ink-soft">
            {t("settings.apiKeyLabel")}
          </label>
          <div className="relative">
            <Input
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              type={showKey ? "text" : "password"}
              placeholder={t("settings.apiKeyPlaceholderNew")}
              className="h-10 rounded-md border-editorial-hairline pr-10 text-[13px]"
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
        <div>
          <label className="mb-1.5 block text-[12px] font-medium text-editorial-ink-soft">
            {t("settings.embeddingModelName")}
          </label>
          <Input
            value={modelName}
            onChange={(e) => setModelName(e.target.value)}
            placeholder="BAAI/bge-m3"
            className="h-10 rounded-md border-editorial-hairline text-[13px]"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={saving || !baseUrl || !apiKey || !modelName}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-[13px] font-medium hover:bg-primary/80 disabled:cursor-not-allowed disabled:bg-editorial-surface-strong disabled:text-editorial-ink-soft"
        >
          <Save size={14} />
          <span>{t("common.save")}</span>
        </Button>
      </div>
    </div>
  );
}
