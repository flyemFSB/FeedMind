import * as React from "react";
import { Popover } from "@base-ui/react/popover";
import { Autocomplete } from "@base-ui/react/autocomplete";
import { m } from "motion/react";
import { Check, ChevronDown, Cpu, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ProviderIcon } from "@/components/icons/provider-icon";
import { formatKB } from "@/lib/constants/provider-models";
import { useModels, useSelectedModel, useSetSelectedModel } from "@/lib/hooks/use-models";
import { persistSelectedFeedMindModel } from "@/lib/api/agent";
import { motionPressTransition, popoverVariants } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { LLMModel } from "@/lib/types";

const GROUP_HEADING_CLASS =
  "px-2 pt-1.5 pb-1 text-[10px] font-semibold text-editorial-ink-muted/80 tracking-wider uppercase select-none";

const ITEM_CLASS = cn(
  "group flex cursor-pointer select-none items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-editorial-ink outline-none transition-colors",
  "hover:bg-editorial-surface-soft focus-visible:bg-editorial-surface-soft data-[highlighted]:bg-editorial-surface-soft",
);

/**
 * ChatModelSelector —— Agent 输入框旁的模型切换器。
 * 分组 + 过滤交给 Base UI Autocomplete，选中即写回会话所选模型。
 */
export function ChatModelSelector({ className }: { className?: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const { data: models = [], isLoading } = useModels("chat");
  const { data: selectedModelId = "" } = useSelectedModel("chat");
  const setSelectedMutation = useSetSelectedModel("chat");
  const [optimisticModelId, setOptimisticModelId] = React.useState<string | null>(null);

  const handleSelect = async (modelId: string) => {
    setOptimisticModelId(modelId);
    setOpen(false);
    try {
      await setSelectedMutation.mutateAsync(modelId);
      await persistSelectedFeedMindModel(modelId);
    } finally {
      setOptimisticModelId(null);
    }
  };

  if (isLoading) {
    return (
      <div
        className={cn(
          "h-7 w-24 animate-pulse rounded-md border border-editorial-hairline bg-editorial-surface-soft/60",
          className,
        )}
      />
    );
  }

  const activeId = optimisticModelId ?? selectedModelId;
  const currentModel = models.find((m) => m.id === activeId) ?? models[0];

  if (!currentModel) {
    return (
      <div
        className={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-md border border-editorial-hairline bg-editorial-surface-soft/50 px-2.5 text-xs text-editorial-ink-muted",
          className,
        )}
      >
        <Cpu size={13} className="shrink-0" />
        <span>{t("settings.noModels", "未配置模型")}</span>
      </div>
    );
  }

  const groups = Object.entries(
    models.reduce<Record<string, LLMModel[]>>((acc, model) => {
      const provider = model.provider || "Default";
      (acc[provider] ??= []).push(model);
      return acc;
    }, {}),
  ).map(([provider, items]) => ({ value: provider, items }));

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <Popover.Trigger
        aria-label={t("settings.selectSessionModel", "切换模型")}
        title={`${currentModel.modelName} (${currentModel.provider})`}
        render={(elementProps, state) => (
          <m.button
            {...elementProps}
            animate={{ scale: state.open ? 1.005 : 1 }}
            transition={motionPressTransition}
          />
        )}
        className={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-md border border-editorial-hairline bg-editorial-surface-soft/80 px-2.5 py-0.5 text-xs font-medium text-editorial-ink-soft transition-colors hover:bg-editorial-surface-strong hover:text-editorial-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent",
          className,
        )}
      >
        <ProviderIcon provider={currentModel.provider} size={14} />
        <span className="max-w-[150px] sm:max-w-[190px] truncate font-medium text-editorial-ink">
          {currentModel.modelName}
        </span>
        <ChevronDown
          size={12}
          className={cn(
            "text-editorial-ink-muted transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Positioner side="top" align="start" sideOffset={6} className="isolate z-50">
          <Popover.Popup
            className="relative z-50 w-[300px] max-h-(--available-height) origin-(--transform-origin) overflow-hidden rounded-xl border border-editorial-hairline bg-editorial-surface-card text-editorial-ink shadow-island outline-none"
            render={(elementProps, state) => (
              <m.div
                {...elementProps}
                initial="closed"
                animate={state.open ? "open" : "closed"}
                variants={popoverVariants}
              />
            )}
          >
            <Autocomplete.Root
              items={groups}
              value={query}
              onValueChange={setQuery}
              itemToStringValue={(item: unknown) => {
                if (!item || typeof item !== "object") return "";
                if ("modelName" in item) {
                  const m = item as LLMModel;
                  return `${m.modelName} ${m.provider} ${m.modelId}`;
                }
                if ("items" in item && Array.isArray((item as { items: unknown[] }).items)) {
                  return (item as { items: LLMModel[] }).items
                    .map((m) => `${m.modelName} ${m.provider} ${m.modelId}`)
                    .join(" ");
                }
                return "value" in item ? String((item as { value: unknown }).value ?? "") : "";
              }}
              autoHighlight="always"
              inline
              open
            >
              <div className="flex items-center gap-2 px-2.5 pt-2 pb-1">
                <Search
                  size={13}
                  className="pointer-events-none shrink-0 text-editorial-ink-muted"
                />
                <Autocomplete.Input
                  placeholder={t("common.search", "搜索模型...")}
                  className="w-full bg-transparent text-xs text-editorial-ink outline-none placeholder:text-editorial-ink-muted leading-none"
                />
              </div>

              <Autocomplete.List className="max-h-60 overflow-x-hidden overflow-y-auto px-1 pb-1 pt-0.5">
                <Autocomplete.Empty className="empty:hidden py-4 text-center text-xs text-editorial-ink-muted">
                  {t("chat.noMatchingModels", "未找到匹配模型")}
                </Autocomplete.Empty>
                {groups.map((group) => (
                  <Autocomplete.Group
                    key={group.value}
                    items={group.items}
                    className="px-0.5 py-0.5 not-first:border-t not-first:border-editorial-hairline-soft not-first:mt-1 not-first:pt-1"
                  >
                    <Autocomplete.GroupLabel className={GROUP_HEADING_CLASS}>
                      {group.value}
                    </Autocomplete.GroupLabel>
                    {group.items.map((model) => (
                      <ModelRow
                        key={model.id}
                        model={model}
                        selected={model.id === currentModel.id}
                        onSelect={() => void handleSelect(model.id)}
                      />
                    ))}
                  </Autocomplete.Group>
                ))}
              </Autocomplete.List>
            </Autocomplete.Root>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function ModelRow({
  model,
  selected,
  onSelect,
}: {
  model: LLMModel;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Autocomplete.Item
      value={model}
      onClick={onSelect}
      className={cn(ITEM_CLASS, selected && "bg-editorial-accent-soft/35 font-medium")}
    >
      <ProviderIcon provider={model.provider} size={14} />
      <span className="min-w-0 flex-1 truncate font-medium text-xs text-editorial-ink">
        {model.modelName}
      </span>
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {model.contextWindow && (
          <span className="rounded border border-editorial-hairline bg-editorial-surface-soft px-1.5 py-0.5 font-mono text-[10px] text-editorial-ink-muted leading-none">
            {formatKB(model.contextWindow)}
          </span>
        )}
        <div className="flex w-3.5 items-center justify-center">
          {selected && <Check size={13} className="shrink-0 text-editorial-accent" />}
        </div>
      </div>
    </Autocomplete.Item>
  );
}
