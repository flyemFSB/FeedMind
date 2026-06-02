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
} from "lucide-react";
import { Menu } from "@base-ui/react/menu";
import { toast } from "sonner";
import type { LLMModel } from "@/lib/types";
import { getLLMModelRuntime } from "@/lib/api/llms";
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

const iconButtonClass =
  "flex h-6 w-6 items-center justify-center rounded-md text-[#86868b] opacity-0 transition-colors hover:bg-white hover:text-[#1d1d1f] focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3]/30 disabled:pointer-events-none disabled:opacity-0 group-hover/model-row:opacity-100 group-focus-within/model-row:opacity-100";
const menuItemClass =
  "flex cursor-default items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[#1d1d1f] outline-none hover:bg-[#f5f5f7] data-highlighted:bg-[#f5f5f7]";

function VisibilityIcon({ visible, size }: { visible: boolean; size: number }) {
  const Icon = visible ? EyeOff : Eye;
  return <Icon size={size} strokeWidth={1.7} />;
}

function getApiKeyDisplay(model: LLMModel, visible: boolean, apiKey?: string): string {
  if (!model.hasApiKey) return "未配置";
  if (!visible) return "********";
  return apiKey ?? "加载中...";
}

function getApiKeyTooltip(model: LLMModel, visible: boolean, apiKey?: string): string {
  if (!model.hasApiKey) return "未配置";
  if (!visible) return "密钥已隐藏";
  return apiKey ?? "密钥加载中...";
}

interface ModelsPanelProps {
  models: LLMModel[];
  onAddModel: () => void;
  onEditModel: (model: LLMModel) => void;
  onDeleteModel: (model: LLMModel) => void;
}

export function ModelsPanel({ models, onAddModel, onEditModel, onDeleteModel }: ModelsPanelProps) {
  const [providerFilter, setProviderFilter] = useState("全部");
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const [apiKeyCache, setApiKeyCache] = useState<Record<string, string>>({});

  const visibleModels = useMemo(
    () =>
      providerFilter === "全部"
        ? models
        : models.filter((model) => model.provider === providerFilter),
    [models, providerFilter],
  );

  const providerFilters = useMemo(
    () => ["全部", ...Array.from(new Set(models.map((model) => model.provider)))],
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
    return getLLMModelRuntime(model.id).then((runtime) => {
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
      toast.error(err.message || "读取密钥失败");
    });
  }

  async function copyApiKey(model: LLMModel) {
    if (!model.hasApiKey) return;
    try {
      const key = await loadApiKey(model);
      await navigator.clipboard.writeText(key);
      toast.success("密钥已复制");
    } catch {
      toast.error("复制失败");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-[#1d1d1f]">模型配置</h3>
          <p className="mt-0.5 text-[12px] text-[#86868b]">
            手动添加模型供应商、模型名称、Base URL 与 API KEY。
          </p>
        </div>
        <Button
          onClick={onAddModel}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0071e3] text-white text-[13px] font-medium hover:bg-[#0066cc] transition-colors"
        >
          <Plus size={14} />
          <span>添加模型</span>
        </Button>
      </div>

      <div className="flex max-w-full items-center gap-2 overflow-x-auto pb-1">
        {providerFilters.map((p) => (
          <Button
            key={p}
            onClick={() => setProviderFilter(p)}
            variant={providerFilter === p ? "default" : "secondary"}
            size="sm"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
              providerFilter === p
                ? "bg-[#1d1d1f] text-white"
                : "bg-[#f5f5f7] text-[#6e6e73] hover:bg-[#e8e8ed]"
            }`}
          >
            {p !== "全部" && <ProviderIcon provider={p} size={16} />}
            {p}
          </Button>
        ))}
      </div>

      <div className="max-w-full overflow-hidden rounded-xl border border-[#d2d2d7]">
        <Table className="w-full table-fixed">
          <TableHeader>
            <TableRow className="border-b border-[#d2d2d7] bg-[#f5f5f7]">
              <TableHead className="w-[14%] px-4 py-3 text-[11px] uppercase tracking-wide text-[#86868b]">
                提供商
              </TableHead>
              <TableHead className="w-[20%] px-4 py-3 text-[11px] uppercase tracking-wide text-[#86868b]">
                模型名称
              </TableHead>
              <TableHead className="w-[28%] px-4 py-3 text-[11px] uppercase tracking-wide text-[#86868b]">
                端点 (Base URL)
              </TableHead>
              <TableHead className="w-[24%] px-4 py-3 text-[11px] uppercase tracking-wide text-[#86868b]">
                密钥（API KEY）
              </TableHead>
              <TableHead className="w-[14%] px-4 py-3 text-[11px] uppercase tracking-wide text-[#86868b]">
                操作
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleModels.map((model) => (
              <TableRow
                key={model.id}
                className="group/model-row border-b border-[#f5f5f7] last:border-0 hover:bg-[#f5f5f7]"
              >
                <TableCell className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <ProviderIcon provider={model.provider} />
                    <span className="truncate text-[13px] text-[#1d1d1f]" title={model.provider}>
                      {model.provider}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="px-4 py-3 text-[13px] text-[#1d1d1f]">
                  <div className="grid grid-cols-[minmax(0,1fr)_24px] items-center gap-2">
                    <span className="truncate" title={model.modelName}>
                      {model.modelName}
                    </span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(model.modelName, "模型名称已复制")}
                      className={iconButtonClass}
                      aria-label="复制模型名称"
                      title="复制模型名称"
                    >
                      <Copy size={14} strokeWidth={1.7} />
                    </button>
                  </div>
                </TableCell>
                <TableCell className="px-4 py-3 text-[12px] text-[#6e6e73]">
                  <div className="grid grid-cols-[minmax(0,1fr)_24px] items-center gap-2">
                    <span className="truncate font-mono" title={model.baseUrl || "未配置"}>
                      {model.baseUrl || "—"}
                    </span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(model.baseUrl, "端点已复制")}
                      disabled={!model.baseUrl}
                      className={iconButtonClass}
                      aria-label="复制端点"
                      title="复制端点"
                    >
                      <Copy size={14} strokeWidth={1.7} />
                    </button>
                  </div>
                </TableCell>
                <TableCell className="px-4 py-3 text-[12px] text-[#6e6e73]">
                  <div className="grid grid-cols-[minmax(0,1fr)_56px] items-center gap-2">
                    <span
                      className="truncate font-mono"
                      title={getApiKeyTooltip(
                        model,
                        Boolean(visibleKeys[model.id]),
                        apiKeyCache[model.id],
                      )}
                    >
                      {getApiKeyDisplay(
                        model,
                        Boolean(visibleKeys[model.id]),
                        apiKeyCache[model.id],
                      )}
                    </span>
                    <div className="flex w-14 justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => toggleKeyVisibility(model)}
                        disabled={!model.hasApiKey}
                        className={iconButtonClass}
                        aria-label={visibleKeys[model.id] ? "隐藏密钥" : "显示密钥"}
                        title={visibleKeys[model.id] ? "隐藏密钥" : "显示密钥"}
                      >
                        <VisibilityIcon visible={Boolean(visibleKeys[model.id])} size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => void copyApiKey(model)}
                        disabled={!model.hasApiKey}
                        className={iconButtonClass}
                        aria-label="复制密钥"
                        title="复制密钥"
                      >
                        <Copy size={14} strokeWidth={1.7} />
                      </button>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="px-4 py-3 text-left">
                  <Menu.Root>
                    <Menu.Trigger
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#86868b] transition-colors hover:bg-white hover:text-[#1d1d1f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3]/30"
                      title="更多操作"
                    >
                      <MoreHorizontal size={15} strokeWidth={1.8} />
                    </Menu.Trigger>
                    <Menu.Portal>
                      <Menu.Positioner side="bottom" align="end" sideOffset={6} className="z-[60]">
                        <Menu.Popup className="flex min-w-[132px] flex-col rounded-xl border border-[#d2d2d7] bg-white p-1 text-[12px] shadow-lg outline-none">
                          <Menu.Item className={menuItemClass}>
                            <FlaskConical size={14} strokeWidth={1.6} />
                            <span>测试</span>
                          </Menu.Item>
                          <Menu.Item onClick={() => onEditModel(model)} className={menuItemClass}>
                            <Wrench size={14} strokeWidth={1.6} />
                            <span>修改</span>
                          </Menu.Item>
                          <Menu.Item
                            onClick={() => onDeleteModel(model)}
                            className="flex cursor-default items-center gap-2 rounded-lg px-2.5 py-2 text-left text-red-500 outline-none hover:bg-red-50 data-highlighted:bg-red-50"
                          >
                            <Trash2 size={14} strokeWidth={1.6} />
                            <span>删除</span>
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
    </div>
  );
}
