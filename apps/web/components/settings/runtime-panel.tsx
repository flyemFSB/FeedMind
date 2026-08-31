import { useEffect, useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { useRuntimeConfigs, useUpdateRuntimeConfig } from "@/lib/hooks/use-runtime-config";
import type { RuntimeConfigUpdate } from "@/lib/api/runtime-config";
import { useModels } from "@/lib/hooks/use-models";
import { Slider } from "@/components/ui/slider";
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
import { toast } from "@/components/ui/toast";
import { useTranslation } from "react-i18next";
import { fadeSlideVariants } from "@/lib/motion";

type InnerTab = "session" | "wiki";

interface ConfigFormFields {
  temperature: number;
  top_p: number;
  system_prompt: string;
  llm_id: string; // web 层传入的字符串模型 ID
}

const defaultFields: ConfigFormFields = {
  temperature: 0.2,
  top_p: 1,
  system_prompt: "",
  llm_id: "",
};

function useDebounce<T extends unknown[]>(fn: (...args: T) => void, delay: number) {
  const fnRef = useRef(fn);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);
  useEffect(() => () => clearTimeout(timerRef.current), []);
  return (...args: T) => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fnRef.current(...args), delay);
  };
}

export function RuntimePanel() {
  const { t } = useTranslation();
  const [innerTab, setInnerTab] = useState<InnerTab>("session");
  const { data: configs = [], isLoading } = useRuntimeConfigs({ enabled: true });
  const updateConfig = useUpdateRuntimeConfig();
  const { data: models = [] } = useModels("chat");

  const sessionConfig = configs.find((c) => c.runtime === "session");
  const wikiConfig = configs.find((c) => c.runtime === "wiki");

  const [sessionFields, setSessionFields] = useState<ConfigFormFields>(defaultFields);
  const [wikiFields, setWikiFields] = useState<ConfigFormFields>(defaultFields);

  useEffect(() => {
    if (sessionConfig) {
      setSessionFields({
        temperature: sessionConfig.temperature,
        top_p: sessionConfig.top_p,
        system_prompt: sessionConfig.system_prompt,
        llm_id: sessionConfig.llm_id ? String(sessionConfig.llm_id) : "",
      });
    }
  }, [sessionConfig]);

  useEffect(() => {
    if (wikiConfig) {
      setWikiFields({
        temperature: wikiConfig.temperature,
        top_p: wikiConfig.top_p,
        system_prompt: wikiConfig.system_prompt,
        llm_id: wikiConfig.llm_id ? String(wikiConfig.llm_id) : "",
      });
    }
  }, [wikiConfig]);

  function persistField(key: "temperature" | "top_p" | "system_prompt", value: number | string) {
    const payload: RuntimeConfigUpdate = { [key]: value };
    updateConfig.mutate({ runtime: innerTab, ...payload });
  }

  const debouncedPersistField = useDebounce(
    (key: "temperature" | "top_p" | "system_prompt", value: number | string) =>
      persistField(key, value),
    600,
  );

  function handleSessionFieldChange<K extends keyof ConfigFormFields>(
    key: K,
    value: ConfigFormFields[K],
  ) {
    setSessionFields((prev) => ({ ...prev, [key]: value }));
    if (key === "system_prompt") {
      debouncedPersistField(key as "system_prompt", value);
    } else {
      persistField(key as "temperature" | "top_p", value);
    }
  }

  function handleWikiFieldChange<K extends keyof ConfigFormFields>(
    key: K,
    value: ConfigFormFields[K],
  ) {
    setWikiFields((prev) => ({ ...prev, [key]: value }));
    if (key === "system_prompt") {
      debouncedPersistField(key as "system_prompt", value);
    } else {
      persistField(key as "temperature" | "top_p", value);
    }
  }

  async function handleWikiModelSelect(modelId: string) {
    if (!modelId) return;
    setWikiFields((prev) => ({ ...prev, llm_id: modelId }));
    await updateConfig.mutateAsync({ runtime: "wiki", llm_id: Number(modelId) });
    toast.add({ title: t("settings.wikiModelUpdated"), type: "success" });
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
          <h3 className="text-sm font-semibold text-editorial-ink">{t("settings.runtime")}</h3>
          <p className="mt-0.5 text-xs text-editorial-ink-muted">
            {t("settings.runtimeDescription")}
          </p>
        </div>
      </div>

      {/* Inner tabs: 会话模型 | WIKI 模型 */}
      <div className="flex gap-1 border-b border-editorial-hairline">
        <m.button
          onClick={() => setInnerTab("session")}
          whileTap={{ scale: 0.98 }}
          className={`px-4 py-2 text-body font-medium border-b-2 ${
            innerTab === "session"
              ? "border-editorial-primary text-editorial-ink"
              : "border-transparent text-editorial-ink-muted hover:text-editorial-ink"
          }`}
        >
          {t("settings.sessionModelTab")}
        </m.button>
        <m.button
          onClick={() => setInnerTab("wiki")}
          whileTap={{ scale: 0.98 }}
          className={`px-4 py-2 text-body font-medium border-b-2 ${
            innerTab === "wiki"
              ? "border-editorial-primary text-editorial-ink"
              : "border-transparent text-editorial-ink-muted hover:text-editorial-ink"
          }`}
        >
          {t("settings.wikiModelTab")}
        </m.button>
      </div>

      {/* Model selector area */}
      <AnimatePresence mode="wait" initial={false}>
        <m.div
          key={innerTab}
          className="space-y-4"
          variants={fadeSlideVariants}
          initial="initial"
          animate="animate"
          exit="exit"
        >
          {innerTab === "session" ? (
            <SessionModelSelectorSection />
          ) : (
            <WikiModelSelectorSection
              models={models}
              selectedId={wikiFields.llm_id}
              onSelect={(id) => void handleWikiModelSelect(id)}
            />
          )}
        </m.div>
      </AnimatePresence>

      {/* Config fields */}
      <div className="grid min-w-0 grid-cols-2 gap-4">
        <div>
          <span className="text-xs text-editorial-ink-muted mb-1.5 block">
            {t("settings.temperature")}
          </span>
          <div className="flex items-center gap-2">
            <Slider
              aria-label={t("settings.temperature")}
              min={0}
              max={2}
              step={0.1}
              value={[currentFields.temperature]}
              onValueChange={(value: number | readonly number[]) => {
                const v = Array.isArray(value) ? (value[0] ?? 0) : value;
                if (innerTab === "session") {
                  handleSessionFieldChange("temperature", v);
                } else {
                  handleWikiFieldChange("temperature", v);
                }
              }}
              className="flex-1"
            />
            <span className="text-xs text-editorial-ink w-8 text-right">
              {currentFields.temperature.toFixed(1)}
            </span>
          </div>
        </div>
        <div>
          <span className="text-xs text-editorial-ink-muted mb-1.5 block">
            {t("settings.topP")}
          </span>
          <div className="flex items-center gap-2">
            <Slider
              aria-label={t("settings.topP")}
              min={0}
              max={1}
              step={0.05}
              value={[currentFields.top_p]}
              onValueChange={(value: number | readonly number[]) => {
                const v = Array.isArray(value) ? (value[0] ?? 1) : value;
                if (innerTab === "session") {
                  handleSessionFieldChange("top_p", v);
                } else {
                  handleWikiFieldChange("top_p", v);
                }
              }}
              className="flex-1"
            />
            <span className="text-xs text-editorial-ink w-8 text-right">
              {currentFields.top_p.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* System prompt */}
      <div>
        <label
          htmlFor="system-prompt-textarea"
          className="text-xs text-editorial-ink-muted mb-1.5 block"
        >
          {t("settings.systemPrompt")}
        </label>
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
          className="w-full px-4 py-3 rounded-md border border-editorial-hairline text-body text-editorial-ink resize-none focus:outline-none focus:border-editorial-primary"
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
      <span className="text-xs text-editorial-ink-muted mb-1.5 block">
        {t("settings.sessionModel")}
      </span>
      <ModelSelector />
      <p className="mt-1 text-xs text-editorial-ink-muted">{t("settings.sessionModelDesc")}</p>
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
      <span className="text-xs text-editorial-ink-muted mb-1.5 block">
        {t("settings.wikiModel")}
      </span>
      <Select
        value={hasModels ? selectedId : ""}
        onValueChange={(v: string | null) => {
          if (v) onSelect(v);
        }}
      >
        <SelectTrigger
          aria-label={t("settings.selectWikiModel")}
          className="h-10 w-[260px] rounded-md border-editorial-hairline bg-editorial-surface-card px-4 text-body text-editorial-ink hover:bg-editorial-surface-soft"
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
        <SelectContent align="end" className="rounded-md border-editorial-hairline">
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
      <p className="mt-1 text-xs text-editorial-ink-muted">{t("settings.wikiModelDesc")}</p>
    </div>
  );
}
