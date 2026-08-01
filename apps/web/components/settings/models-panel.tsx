"use client";

import { useMemo, useState } from "react";
import {
  Copy,
  Eye,
  EyeOff,
  MoreHorizontal,
  FlaskConical,
  Wrench,
  Trash2,
  Plus,
  Sparkles,
} from "lucide-react";
import { Menu } from "@base-ui/react/menu";
import { toast } from "sonner";
import type { LLMModel } from "@/lib/types";
import { getModelRuntime } from "@/lib/api/models";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ProviderIcon } from "@/components/settings/provider-icon";
import { lookupModelInfo, formatKB } from "@/lib/constants/provider-models";
import type { FreeModelPreset } from "@/lib/constants/free-models";
import { FreeModelDialog } from "./free-model-dialog";
import { useTranslation } from "react-i18next";

const iconButtonClass =
  "flex h-6 w-6 items-center justify-center rounded-md text-editorial-ink-muted opacity-0 hover:bg-editorial-surface-soft hover:text-editorial-ink focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editorial-primary/30 disabled:pointer-events-none disabled:opacity-0 group-hover/model-row:opacity-100 group-focus-within/model-row:opacity-100";
const menuItemClass =
  "flex cursor-default items-center gap-2 rounded-md px-2.5 py-2 text-left text-editorial-ink outline-none hover:bg-editorial-surface-soft data-highlighted:bg-editorial-surface-soft";

function VisibilityIcon({ visible, size }: { visible: boolean; size: number }) {
  const Icon = visible ? EyeOff : Eye;
  return <Icon size={size} strokeWidth={1.7} />;
}

function getApiKeyDisplay(
  model: LLMModel,
  visible: boolean,
  t: (key: string) => string,
  apiKey?: string,
): string {
  if (!model.hasApiKey) return t("settings.noApiKey");
  if (!visible) return "********";
  return apiKey ?? t("common.loading");
}

function getApiKeyTooltip(
  model: LLMModel,
  visible: boolean,
  t: (key: string) => string,
  apiKey?: string,
): string {
  if (!model.hasApiKey) return t("settings.noApiKey");
  if (!visible) return t("settings.keyHidden");
  return apiKey ?? t("settings.loadingKey");
}

interface ModelsPanelProps {
  models: LLMModel[];
  title?: string;
  /** 隐藏提供商列和提供商过滤按钮（嵌入模型使用） */
  showProvider?: boolean;
  onAddModel: () => void;
  onEditModel: (model: LLMModel) => void;
  onDeleteModel: (model: LLMModel) => void;
  /** 传入免费模型 preset 时，头部显示「添加免费模型」入口 */
  freeModelPreset?: FreeModelPreset;
}

export function ModelsPanel({
  models,
  title,
  showProvider = true,
  onAddModel,
  onEditModel,
  onDeleteModel,
  freeModelPreset,
}: ModelsPanelProps) {
  const { t } = useTranslation();
  const ALL_FILTER = "__all__";
  const [providerFilter, setProviderFilter] = useState(ALL_FILTER);
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const [apiKeyCache, setApiKeyCache] = useState<Record<string, string>>({});
  const [showFreeDialog, setShowFreeDialog] = useState(false);

  const visibleModels = useMemo(
    () =>
      providerFilter === ALL_FILTER
        ? models
        : models.filter((model) => model.provider === providerFilter),
    [models, providerFilter],
  );

  const providerFilters = useMemo(
    () => [ALL_FILTER, ...Array.from(new Set(models.map((model) => model.provider)))],
    [models],
  );

  function copyToClipboard(text: string, msg: string) {
    if (!text) return;
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success(msg))
      .catch(() => {});
  }

  function loadApiKey(model: LLMModel): Promise<string> {
    const cached = apiKeyCache[model.id];
    if (cached != null) return Promise.resolve(cached);
    return getModelRuntime(model.id).then((runtime) => {
      setApiKeyCache((prev) => ({ ...prev, [model.id]: runtime.api_key }));
      return runtime.api_key;
    });
  }

  function toggleKeyVisibility(model: LLMModel) {
    const next = !visibleKeys[model.id];
    setVisibleKeys((prev) => ({ ...prev, [model.id]: next }));
    if (!next || !model.hasApiKey) return;
    loadApiKey(model).catch((err: Error) => {
      setVisibleKeys((prev) => ({ ...prev, [model.id]: false }));
      toast.error(err.message || t("settings.readKeyFailed"));
    });
  }

  async function copyApiKey(model: LLMModel) {
    if (!model.hasApiKey) return;
    try {
      const key = await loadApiKey(model);
      await navigator.clipboard.writeText(key);
      toast.success(t("settings.keyCopied"));
    } catch {
      toast.error(t("settings.copyFailed"));
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold text-editorial-ink">
            {title ?? t("settings.models")}
          </h3>
          <p className="mt-0.5 text-[12px] text-editorial-ink-muted">
            {t("settings.modelsDescription")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {freeModelPreset && (
            <Button
              onClick={() => setShowFreeDialog(true)}
              variant="secondary"
              className="flex items-center gap-1.5 rounded-md bg-editorial-surface-soft px-3 py-2 text-[13px] font-medium text-editorial-ink-soft hover:bg-editorial-surface-strong hover:text-editorial-ink"
            >
              <Sparkles size={13} />
              <span>{t("settings.addFreeModel")}</span>
            </Button>
          )}
          <Button
            onClick={onAddModel}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-[13px] font-medium hover:bg-primary/80"
          >
            <Plus size={14} />
            <span>{t("settings.addModel")}</span>
          </Button>
        </div>
      </div>

      {showProvider && (
        <div className="flex max-w-full items-center gap-2 overflow-x-auto pb-1">
          {providerFilters.map((p) => (
            <Button
              key={p}
              onClick={() => setProviderFilter(p)}
              variant={providerFilter === p ? "default" : "secondary"}
              size="sm"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium ${
                providerFilter === p
                  ? "bg-editorial-surface-strong text-editorial-ink"
                  : "bg-editorial-surface-soft text-editorial-ink-soft hover:bg-editorial-surface-strong"
              }`}
            >
              {p !== ALL_FILTER && <ProviderIcon provider={p} size={16} />}
              {p === ALL_FILTER ? t("common.all") : p}
            </Button>
          ))}
        </div>
      )}

      <div className="max-w-full overflow-hidden rounded-lg border border-editorial-hairline">
        <Table className="w-full table-fixed">
          <TableHeader>
            <TableRow className="border-b border-editorial-hairline bg-editorial-surface-soft">
              {showProvider && (
                <TableHead className="w-[18%] px-3 py-2.5 text-[11px] uppercase tracking-wide text-editorial-ink-muted">
                  {t("settings.tableProvider")}
                </TableHead>
              )}
              <TableHead
                className={`px-3 py-2.5 text-[11px] uppercase tracking-wide text-editorial-ink-muted ${
                  showProvider ? "w-[32%]" : "w-[30%]"
                }`}
              >
                {t("settings.tableModel")}
              </TableHead>
              <TableHead
                className={`px-3 py-2.5 text-[11px] uppercase tracking-wide text-editorial-ink-muted ${
                  showProvider ? "w-[20%]" : "w-[38%]"
                }`}
              >
                {t("settings.tableEndpoint")}
              </TableHead>
              <TableHead
                className={`px-3 py-2.5 text-[11px] uppercase tracking-wide text-editorial-ink-muted ${
                  showProvider ? "w-[16%]" : "w-[17%]"
                }`}
              >
                {t("settings.tableApiKey")}
              </TableHead>
              <TableHead
                className={`px-3 py-2.5 text-[11px] uppercase tracking-wide text-editorial-ink-muted ${
                  showProvider ? "w-[14%]" : "w-[15%]"
                }`}
              >
                {t("settings.tableActions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleModels.map((model) => (
              <TableRow
                key={model.id}
                className="group/model-row border-b border-editorial-surface-soft last:border-0 hover:bg-editorial-surface-soft"
              >
                {showProvider && (
                  <TableCell className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <ProviderIcon provider={model.provider} size={14} />
                      <span
                        className="truncate text-[13px] text-editorial-ink"
                        title={model.provider}
                      >
                        {model.provider}
                      </span>
                    </div>
                  </TableCell>
                )}
                <TableCell className="px-3 py-2.5 text-[13px] text-editorial-ink">
                  <div className="grid grid-cols-[minmax(0,1fr)_24px] items-center gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="truncate" title={model.modelName}>
                        {model.modelName}
                      </span>
                      {(() => {
                        const info = lookupModelInfo(model.provider, model.modelName);
                        const context = model.contextWindow ?? info?.context;
                        const maxOutput = model.maxOutput ?? info?.maxOutput;
                        if (!context && !maxOutput) return null;
                        return (
                          <span className="flex shrink-0 items-center gap-0.5">
                            {context ? (
                              <span className="inline-flex items-center rounded bg-editorial-surface-soft px-1 py-0.5 text-[11px] font-medium text-editorial-ink-muted leading-none">
                                {formatKB(context)}
                              </span>
                            ) : null}
                            {maxOutput ? (
                              <span className="inline-flex items-center rounded bg-editorial-surface-soft px-1 py-0.5 text-[11px] font-medium text-editorial-ink-muted leading-none">
                                {formatKB(maxOutput)}
                              </span>
                            ) : null}
                          </span>
                        );
                      })()}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        copyToClipboard(model.modelName, t("settings.modelNameCopied"))
                      }
                      className={iconButtonClass}
                      aria-label={t("settings.copyModelName")}
                      title={t("settings.copyModelName")}
                    >
                      <Copy size={14} strokeWidth={1.7} />
                    </button>
                  </div>
                </TableCell>
                <TableCell className="px-3 py-2.5 text-[12px] text-editorial-ink-soft">
                  <div className="grid grid-cols-[minmax(0,1fr)_24px] items-center gap-1">
                    <span
                      className="truncate font-mono"
                      title={model.baseUrl || t("settings.noApiKey")}
                    >
                      {model.baseUrl || "—"}
                    </span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(model.baseUrl, t("settings.endpointCopied"))}
                      disabled={!model.baseUrl}
                      className={iconButtonClass}
                      aria-label={t("settings.copyEndpoint")}
                      title={t("settings.copyEndpoint")}
                    >
                      <Copy size={14} strokeWidth={1.7} />
                    </button>
                  </div>
                </TableCell>
                <TableCell className="px-3 py-2.5 text-[12px] text-editorial-ink-soft">
                  <div className="grid grid-cols-[minmax(0,1fr)_56px] items-center gap-1">
                    <span
                      className="truncate font-mono"
                      title={getApiKeyTooltip(
                        model,
                        Boolean(visibleKeys[model.id]),
                        t,
                        apiKeyCache[model.id],
                      )}
                    >
                      {getApiKeyDisplay(
                        model,
                        Boolean(visibleKeys[model.id]),
                        t,
                        apiKeyCache[model.id],
                      )}
                    </span>
                    <div className="flex w-14 justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => toggleKeyVisibility(model)}
                        disabled={!model.hasApiKey}
                        className={iconButtonClass}
                        aria-label={
                          visibleKeys[model.id] ? t("settings.hideKey") : t("settings.showKey")
                        }
                        title={
                          visibleKeys[model.id] ? t("settings.hideKey") : t("settings.showKey")
                        }
                      >
                        <VisibilityIcon visible={Boolean(visibleKeys[model.id])} size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => void copyApiKey(model)}
                        disabled={!model.hasApiKey}
                        className={iconButtonClass}
                        aria-label={t("settings.copyApiKey")}
                        title={t("settings.copyApiKey")}
                      >
                        <Copy size={14} strokeWidth={1.7} />
                      </button>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="px-3 py-2.5 text-left">
                  <Menu.Root>
                    <Menu.Trigger
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-editorial-ink-muted hover:bg-editorial-surface-soft hover:text-editorial-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editorial-primary/30"
                      title={t("settings.moreActions")}
                    >
                      <MoreHorizontal size={15} strokeWidth={1.8} />
                    </Menu.Trigger>
                    <Menu.Portal>
                      <Menu.Positioner side="bottom" align="end" sideOffset={6} className="z-[60]">
                        <Menu.Popup className="flex min-w-[132px] flex-col rounded-md border border-editorial-hairline bg-editorial-surface-card p-1 text-[12px] shadow-sm outline-none">
                          <Menu.Item className={menuItemClass}>
                            <FlaskConical size={14} strokeWidth={1.6} />
                            <span>{t("settings.testModel")}</span>
                          </Menu.Item>
                          <Menu.Item onClick={() => onEditModel(model)} className={menuItemClass}>
                            <Wrench size={14} strokeWidth={1.6} />
                            <span>{t("common.edit")}</span>
                          </Menu.Item>
                          <Menu.Item
                            onClick={() => onDeleteModel(model)}
                            className="flex cursor-default items-center gap-2 rounded-md px-2.5 py-2 text-left text-destructive outline-none hover:bg-destructive/10 data-highlighted:bg-destructive/10"
                          >
                            <Trash2 size={14} strokeWidth={1.6} />
                            <span>{t("common.delete")}</span>
                          </Menu.Item>
                        </Menu.Popup>
                      </Menu.Positioner>
                    </Menu.Portal>
                  </Menu.Root>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {freeModelPreset && (
        <FreeModelDialog
          open={showFreeDialog}
          preset={freeModelPreset}
          onClose={() => setShowFreeDialog(false)}
        />
      )}
    </div>
  );
}
