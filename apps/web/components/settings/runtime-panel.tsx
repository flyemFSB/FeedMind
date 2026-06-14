"use client";

import { useEffect, useState } from "react";
import { useRuntimeConfigs, useUpdateRuntimeConfig } from "@/lib/hooks/use-runtime-config";
import type { RuntimeConfigUpdate } from "@/lib/api/runtime-config";
import { useLLMModels } from "@/lib/hooks/use-llms";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ProviderIcon } from "./provider-icon";
import { ModelSelector } from "./model-selector";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

type InnerTab = "session" | "wiki";

const CONTEXT_LENGTHS = ["4k", "8k", "16k", "32k", "64k", "128k", "200k"];

interface ConfigFormFields {
  temperature: number;
  max_output_tokens: number;
  top_p: number;
  context_length: string;
  system_prompt: string;
  llm_id: string; // string ID from web layer
}

const defaultFields: ConfigFormFields = {
  temperature: 0.2,
  max_output_tokens: 8192,
  top_p: 1,
  context_length: "128k",
  system_prompt: "",
  llm_id: "",
};

export function RuntimePanel() {
  const { t } = useTranslation();
  const [innerTab, setInnerTab] = useState<InnerTab>("session");
  const { data: configs = [], isLoading } = useRuntimeConfigs({ enabled: true });
  const updateConfig = useUpdateRuntimeConfig();
  const { data: models = [] } = useLLMModels();

  const sessionConfig = configs.find((c) => c.scenario === "session");
  const wikiConfig = configs.find((c) => c.scenario === "wiki");

  // Local form state
  const [sessionFields, setSessionFields] = useState<ConfigFormFields>(defaultFields);
  const [wikiFields, setWikiFields] = useState<ConfigFormFields>(defaultFields);
  const [touched, setTouched] = useState<Set<string>>(new Set());

  // Sync from API when configs load
  useEffect(() => {
    if (sessionConfig) {
      setSessionFields({
        temperature: sessionConfig.temperature,
        max_output_tokens: sessionConfig.max_output_tokens,
        top_p: sessionConfig.top_p,
        context_length: sessionConfig.context_length,
        system_prompt: sessionConfig.system_prompt,
        llm_id: sessionConfig.llm_id ? String(sessionConfig.llm_id) : "",
      });
    }
  }, [sessionConfig]);

  useEffect(() => {
    if (wikiConfig) {
      setWikiFields({
        temperature: wikiConfig.temperature,
        max_output_tokens: wikiConfig.max_output_tokens,
        top_p: wikiConfig.top_p,
        context_length: wikiConfig.context_length,
        system_prompt: wikiConfig.system_prompt,
        llm_id: wikiConfig.llm_id ? String(wikiConfig.llm_id) : "",
      });
    }
  }, [wikiConfig]);

  function markTouched(field: string) {
    setTouched((prev) => new Set(prev).add(`${innerTab}:${field}`));
  }

  function handleSessionFieldChange<K extends keyof ConfigFormFields>(
    key: K,
    value: ConfigFormFields[K],
  ) {
    markTouched(key);
    setSessionFields((prev) => ({ ...prev, [key]: value }));
  }

  function handleWikiFieldChange<K extends keyof ConfigFormFields>(
    key: K,
    value: ConfigFormFields[K],
  ) {
    markTouched(key);
    setWikiFields((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    const fields = innerTab === "session" ? sessionFields : wikiFields;
    const payload: RuntimeConfigUpdate = {};
    if (touched.has(`${innerTab}:temperature`)) payload.temperature = fields.temperature;
    if (touched.has(`${innerTab}:max_output_tokens`)) payload.max_output_tokens = fields.max_output_tokens;
    if (touched.has(`${innerTab}:top_p`)) payload.top_p = fields.top_p;
    if (touched.has(`${innerTab}:context_length`)) payload.context_length = fields.context_length;
    if (touched.has(`${innerTab}:system_prompt`)) payload.system_prompt = fields.system_prompt;

    if (Object.keys(payload).length === 0) {
      toast.success(t("settings.noChanges"));
      return;
    }

    try {
      await updateConfig.mutateAsync({ scenario: innerTab, ...payload });
      setTouched(new Set());
      toast.success(innerTab === "session" ? t("settings.saveSuccess") : t("settings.wikiSaveSuccess"));
    } catch {
      toast.error(t("settings.saveFailed"));
    }
  }

  async function handleWikiModelSelect(modelId: string) {
    if (!modelId) return;
    setWikiFields((prev) => ({ ...prev, llm_id: modelId }));
    await updateConfig.mutateAsync({ scenario: "wiki", llm_id: Number(modelId) });
    toast.success(t("settings.wikiModelUpdated"));
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  const currentFields = innerTab === "session" ? sessionFields : wikiFields;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-editorial-ink">{t("settings.runtime")}</h3>
          <p className="mt-0.5 text-[12px] text-editorial-ink-muted">
            {t("settings.runtimeDescription")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            size="sm"
            onClick={handleSave}
            className="h-8 rounded-xl bg-editorial-primary text-[12px] text-editorial-ink-on-primary hover:bg-editorial-primary"
          >
            {t("common.save")}
          </Button>
        </div>
      </div>

      {/* Inner tabs: 会话模型 | WIKI 模型 */}
      <div className="flex gap-1 border-b border-editorial-hairline">
        <button
          onClick={() => setInnerTab("session")}
          className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors ${
            innerTab === "session"
              ? "border-editorial-primary text-editorial-ink"
              : "border-transparent text-editorial-ink-muted hover:text-editorial-ink"
          }`}
        >
          {t("settings.sessionModelTab")}
        </button>
        <button
          onClick={() => setInnerTab("wiki")}
          className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors ${
            innerTab === "wiki"
              ? "border-editorial-primary text-editorial-ink"
              : "border-transparent text-editorial-ink-muted hover:text-editorial-ink"
          }`}
        >
          {t("settings.wikiModelTab")}
        </button>
      </div>

      {/* Model selector area */}
      <div className="space-y-4">
        {innerTab === "session" ? (
          <SessionModelSelectorSection />
        ) : (
          <WikiModelSelectorSection
            models={models}
            selectedId={wikiFields.llm_id}
            onSelect={handleWikiModelSelect}
          />
        )}
      </div>

      {/* Config fields */}
      <div className="grid min-w-0 grid-cols-3 gap-4">
        <div>
          <label className="text-[12px] text-editorial-ink-muted mb-1.5 block">{t("settings.temperature")}</label>
          <div className="flex items-center gap-2">
            <Slider
              aria-label={t("settings.temperature")}
              min={0}
              max={2}
              step={0.1}
              value={[currentFields.temperature]}
              onValueChange={(value: number | readonly number[]) => {
                const v = Array.isArray(value) ? value[0] ?? 0 : value;
                if (innerTab === "session") {
                  handleSessionFieldChange("temperature", v);
                } else {
                  handleWikiFieldChange("temperature", v);
                }
              }}
              className="flex-1"
            />
            <span className="text-[12px] text-editorial-ink w-8 text-right">
              {currentFields.temperature.toFixed(1)}
            </span>
          </div>
        </div>
        <div>
          <label className="text-[12px] text-editorial-ink-muted mb-1.5 block">{t("settings.topP")}</label>
          <div className="flex items-center gap-2">
            <Slider
              aria-label={t("settings.topP")}
              min={0}
              max={1}
              step={0.05}
              value={[currentFields.top_p]}
              onValueChange={(value: number | readonly number[]) => {
                const v = Array.isArray(value) ? value[0] ?? 1 : value;
                if (innerTab === "session") {
                  handleSessionFieldChange("top_p", v);
                } else {
                  handleWikiFieldChange("top_p", v);
                }
              }}
              className="flex-1"
            />
            <span className="text-[12px] text-editorial-ink w-8 text-right">
              {currentFields.top_p.toFixed(2)}
            </span>
          </div>
        </div>
        <div>
          <label htmlFor="max-tokens-input" className="text-[12px] text-editorial-ink-muted mb-1.5 block">{t("settings.maxTokens")}</label>
          <Input
            id="max-tokens-input"
            type="number"
            value={currentFields.max_output_tokens}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (innerTab === "session") {
                handleSessionFieldChange("max_output_tokens", v);
              } else {
                handleWikiFieldChange("max_output_tokens", v);
              }
            }}
            className="h-10 rounded-xl border-editorial-hairline text-[13px]"
          />
        </div>
        <div>
          <label htmlFor="context-length-select" className="text-[12px] text-editorial-ink-muted mb-1.5 block">{t("settings.contextLength")}</label>
          <Select
            value={currentFields.context_length}
            onValueChange={(v: string | null) => {
              if (!v) return;
              if (innerTab === "session") {
                handleSessionFieldChange("context_length", v);
              } else {
                handleWikiFieldChange("context_length", v);
              }
            }}
          >
            <SelectTrigger
              id="context-length-select"
              aria-label={t("settings.selectContextLength")}
              className="h-10 w-full rounded-xl border-editorial-hairline bg-editorial-surface-card px-4 text-[13px]"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-editorial-hairline">
              <SelectGroup>
                {CONTEXT_LENGTHS.map((len) => (
                  <SelectItem key={len} value={len}>
                    {len}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* System prompt */}
      <div>
        <label htmlFor="system-prompt-textarea" className="text-[12px] text-editorial-ink-muted mb-1.5 block">{t("settings.systemPrompt")}</label>
        <Textarea
          id="system-prompt-textarea"
          value={currentFields.system_prompt}
          onChange={(e) => {
            if (innerTab === "session") {
              handleSessionFieldChange("system_prompt", e.target.value);
            } else {
              handleWikiFieldChange("system_prompt", e.target.value);
            }
          }}
          rows={4}
          className="w-full px-4 py-3 rounded-xl border border-editorial-hairline text-[13px] text-editorial-ink resize-none focus:outline-none focus:border-editorial-primary"
        />
      </div>
    </div>
  );
}

// ─── Session Model Selector ─────────────────────────────────────────

function SessionModelSelectorSection() {
  const { t } = useTranslation();
  return (
    <div>
      <label className="text-[12px] text-editorial-ink-muted mb-1.5 block">{t("settings.sessionModel")}</label>
      <ModelSelector />
      <p className="mt-1 text-[11px] text-editorial-ink-muted">
        {t("settings.sessionModelDesc")}
      </p>
    </div>
  );
}

// ─── Wiki Model Selector ────────────────────────────────────────────

function WikiModelSelectorSection({
  models,
  selectedId,
  onSelect,
}: {
  models: Array<{ id: string; provider: string; modelName: string }>;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  const hasModels = models.length > 0;
  const optionMap = new Map(models.map((m) => [m.id, m]));

  return (
    <div>
      <label className="text-[12px] text-editorial-ink-muted mb-1.5 block">{t("settings.wikiModel")}</label>
      <Select value={hasModels ? selectedId : ""} onValueChange={(v: string | null) => { if (v) onSelect(v); }}>
        <SelectTrigger
          aria-label={t("settings.selectWikiModel")}
          className="h-10 w-[260px] rounded-xl border-editorial-hairline bg-editorial-surface-card px-4 text-[13px] text-editorial-ink hover:bg-editorial-surface-soft"
          disabled={!hasModels}
        >
          <SelectValue placeholder={hasModels ? t("settings.noOptions") : t("settings.noModels")}>
            {(value: string | null) => {
              const model = hasModels && value ? optionMap.get(value) : null;
              return model ? (
                <span className="flex items-center gap-2">
                  <ProviderIcon provider={model.provider} size={16} />
                  <span className="truncate">{model.modelName}</span>
                </span>
              ) : (
                <span className="text-editorial-ink-muted">{t("settings.noModels")}</span>
              );
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent align="end" className="rounded-xl border-editorial-hairline">
          <SelectGroup>
            {models.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                <span className="flex items-center gap-2">
                  <ProviderIcon provider={model.provider} size={18} />
                  <span>{model.modelName}</span>
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <p className="mt-1 text-[11px] text-editorial-ink-muted">
        {t("settings.wikiModelDesc")}
      </p>
    </div>
  );
}
