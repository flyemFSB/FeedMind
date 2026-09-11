import { useEffect, useState } from "react";
import { useModels, useSelectedModel, useSetSelectedModel } from "@/lib/hooks/use-models";
import {
  onSelectedFeedMindModelChange,
  persistSelectedFeedMindModel,
  setSelectedFeedMindModelId,
} from "@/lib/api/agent";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ProviderIcon } from "@/components/icons/provider-icon";
import { useTranslation } from "react-i18next";

export function ModelSelector() {
  const { t } = useTranslation();
  // 用 react-query 取数，缓存失效自动刷新
  const { data: models = [], isLoading, isError } = useModels("chat");
  const { data: selectedModelId = "" } = useSelectedModel("chat");
  const setSelectedMutation = useSetSelectedModel("chat");

  // 下拉本地状态，与服务端选中及外部变更同步
  const [selectedModel, setSelectedModel] = useState("");
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (selectedModelId) {
      setSelectedModel(selectedModelId);
    }
  }, [selectedModelId]);

  useEffect(() => {
    setLoadError(isError);
  }, [isError]);

  // 监听外部模型变更（如 agent.ts persistSelectedFeedMindModel）
  useEffect(() => {
    const unsubscribe = onSelectedFeedMindModelChange(setSelectedModel);
    return unsubscribe;
  }, []);

  const handleChange = async (modelId: string | null) => {
    if (!modelId) return;

    setSelectedModel(modelId);
    await setSelectedMutation.mutateAsync(modelId);
    await persistSelectedFeedMindModel(modelId);

    // 同步存储 API 模型 ID（如 "deepseek-v4-flash"），供消息快照等场景使用
    const model = models.find((m) => m.id === modelId);
    if (model?.modelId) {
      setSelectedFeedMindModelId(model.modelId);
    }
  };

  if (isLoading) {
    return <Skeleton className="h-10 w-[260px] rounded-md" />;
  }

  const options =
    loadError && selectedModel
      ? [{ label: t("settings.modelLoadFailed"), value: selectedModel, provider: "" }]
      : models.map((model) => ({
          label: model.modelName,
          value: model.id,
          provider: model.provider,
        }));
  const optionMap = new Map(options.map((o) => [o.value, o]));
  const hasModels = models.length > 0;

  return (
    <Select
      value={hasModels ? selectedModel : ""}
      onValueChange={(value) => void handleChange(value)}
    >
      <SelectTrigger
        aria-label={t("settings.selectSessionModel")}
        className="h-10 w-[260px] rounded-md border-editorial-hairline bg-editorial-surface-card px-4 text-body text-editorial-ink hover:bg-editorial-surface-soft"
        disabled={!hasModels || options.length === 0}
      >
        <SelectValue placeholder={hasModels ? t("settings.noOptions") : t("settings.noModels")}>
          {(value: string | null) => {
            const opt = hasModels && value ? optionMap.get(value) : null;
            return opt ? (
              <span className="flex items-center gap-2">
                <ProviderIcon provider={opt.provider} size={16} />
                <span className="truncate">{opt.label}</span>
              </span>
            ) : (
              t("settings.noModels")
            );
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="end" className="border-editorial-hairline">
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
