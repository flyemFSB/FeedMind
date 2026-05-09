"use client";

import { useEffect, useState } from "react";
import type { LLMModel } from "@/lib/types";
import { listLLMModels } from "@/lib/api/llm-models";
import {
  loadSelectedFeedMindModel,
  onSelectedFeedMindModelChange,
  persistSelectedFeedMindModel,
  setSelectedFeedMindModel,
} from "@/lib/api/aegra";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProviderIcon } from "@/components/settings/provider-icon";

export function ModelSelector() {
  const [selectedModel, setSelectedModel] = useState("");
  const [models, setModels] = useState<LLMModel[]>([]);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    void listLLMModels(controller.signal)
      .then((loadedModels) => {
        setModels(loadedModels);
        setLoadError(false);
        if (loadedModels.length === 0) {
          setSelectedModel("");
          setSelectedFeedMindModel("");
          return "";
        }
        return loadSelectedFeedMindModel(controller.signal);
      })
      .then((selected) => {
        setSelectedModel(selected);
      })
      .catch((err) => {
        if (err instanceof Error && err.message.includes("404")) return;
        setLoadError(true);
      });

    const handleModelsChange = () => {
      void listLLMModels()
        .then((loadedModels) => {
          setModels(loadedModels);
          setLoadError(false);
          if (loadedModels.length === 0) {
            setSelectedModel("");
            setSelectedFeedMindModel("");
            return;
          }

          setSelectedModel((current) => {
            if (loadedModels.some((model) => model.id === current)) return current;

            setSelectedFeedMindModel("");
            return "";
          });
        })
        .catch(() => setLoadError(true));
    };
    window.addEventListener("feedmind:llm-models-change", handleModelsChange);

    const unsubscribe = onSelectedFeedMindModelChange(setSelectedModel);
    return () => {
      controller.abort();
      window.removeEventListener("feedmind:llm-models-change", handleModelsChange);
      unsubscribe();
    };
  }, []);

  const handleChange = (model: string | null) => {
    if (!model) return;

    setSelectedModel(model);
    void persistSelectedFeedMindModel(model);
  };

  const options = loadError && selectedModel
    ? [{ label: "模型加载失败", value: selectedModel, provider: "" }]
    : models.map((model) => ({
        label: model.modelName,
        value: model.id,
        provider: model.provider,
      }));
  const optionMap = new Map(options.map((o) => [o.value, o]));
  const hasModels = models.length > 0;

  return (
    <Select value={hasModels ? selectedModel : ""} onValueChange={handleChange}>
      <SelectTrigger
        aria-label="选择会话模型"
        className="h-10 w-[260px] rounded-xl border-[#d2d2d7] bg-white px-4 text-[13px] text-[#1d1d1f] hover:bg-[#f5f5f7]"
        disabled={!hasModels || options.length === 0}
      >
        <SelectValue placeholder={hasModels ? "暂无可选项" : "未配置模型"}>
          {(value: string | null) => {
            const opt = hasModels && value ? optionMap.get(value) : null;
            return opt ? (
              <span className="flex items-center gap-2">
                <ProviderIcon provider={opt.provider} size={16} />
                <span className="truncate">{opt.label}</span>
              </span>
            ) : (
              "未配置模型"
            );
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="end" className="rounded-xl border-[#d2d2d7]">
        <SelectGroup>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <span className="flex items-center gap-2">
                <ProviderIcon provider={option.provider} size={18} />
                <span>{option.label}</span>
              </span>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
