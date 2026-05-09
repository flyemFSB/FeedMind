"use client";

import { useEffect, useState } from "react";
import { Menu } from "@base-ui/react/menu";
import {
  X,
  User,
  Cpu,
  Database,
  MessageSquare,
  Shield,
  Plus,
  MoreHorizontal,
  Trash2,
  Wrench,
  FlaskConical,
  Eye,
  EyeOff,
  Copy,
} from "lucide-react";
import { LLMModel } from "@/lib/types";
import {
  createLLMModel,
  deleteLLMModel,
  getLLMModelRuntime,
  listLLMModels,
  updateLLMModel,
} from "@/lib/api/llm-models";
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
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ProviderIcon } from "@/components/settings/provider-icon";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

type TabId = "account" | "models" | "kb" | "session" | "security";

interface Tab {
  id: TabId;
  label: string;
  icon: React.ElementType;
}

const tabs: Tab[] = [
  { id: "account", label: "账号与偏好", icon: User },
  { id: "models", label: "模型配置", icon: Cpu },
  { id: "kb", label: "知识库配置", icon: Database },
  { id: "session", label: "会话模型配置", icon: MessageSquare },
  { id: "security", label: "安全与密钥", icon: Shield },
];

const modelProviders = [
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
] as const;

const emptyModelForm: Omit<LLMModel, "id" | "hasApiKey"> & { apiKey: string } = {
  provider: "ChatGPT",
  modelName: "",
  baseUrl: "",
  apiKey: "",
};

type ToastType = "error" | "info" | "success";

const tableIconButtonClass =
  "flex h-6 w-6 items-center justify-center rounded-md text-[#86868b] opacity-0 transition-colors hover:bg-white hover:text-[#1d1d1f] focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3]/30 disabled:pointer-events-none disabled:opacity-0 group-hover/model-row:opacity-100 group-focus-within/model-row:opacity-100";

const menuItemClass =
  "flex cursor-default items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[#1d1d1f] outline-none hover:bg-[#f5f5f7] data-highlighted:bg-[#f5f5f7]";

function emitModelsChange() {
  window.dispatchEvent(new Event("feedmind:llm-models-change"));
}

function removeRecordKey<T>(items: Record<string, T>, key: string): Record<string, T> {
  const nextItems = { ...items };
  delete nextItems[key];
  return nextItems;
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

function showToast(message: string, type: ToastType = "info") {
  window.dispatchEvent(
    new CustomEvent("feedmind:toast", {
      detail: { message, type },
    }),
  );
}

function VisibilityIcon({ visible, size }: { visible: boolean; size: number }) {
  const Icon = visible ? EyeOff : Eye;
  return <Icon size={size} strokeWidth={1.7} />;
}

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>("models");
  const [providerFilter, setProviderFilter] = useState("全部");
  const [models, setModels] = useState<LLMModel[]>([]);
  const [modelForm, setModelForm] = useState(emptyModelForm);
  const [showAddModel, setShowAddModel] = useState(false);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [showModelApiKey, setShowModelApiKey] = useState(false);
  const [visibleModelApiKeys, setVisibleModelApiKeys] = useState<Record<string, boolean>>({});
  const [modelApiKeys, setModelApiKeys] = useState<Record<string, string>>({});
  const [deletingModel, setDeletingModel] = useState<LLMModel | null>(null);

  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();
    void listLLMModels(controller.signal)
      .then((loadedModels) => {
        setModels(loadedModels);
      })
      .catch((err) => {
        if (err instanceof Error && err.message.includes("404")) return;
      });

    return () => controller.abort();
  }, [open]);

  if (!open) return null;

const handleAddModel = () => {
    void createLLMModel(modelForm)
      .then((createdModel) => {
        setModels((items) => [...items, createdModel]);
        setShowAddModel(false);
        emitModelsChange();
        showToast("模型添加成功", "success");
      })
      .catch((err: Error) => {
        showToast(err.message || "添加模型失败", "error");
      });
  };

  const handleEditModel = (model: LLMModel) => {
    setEditingModelId(model.id);
    setModelForm({
      provider: model.provider,
      modelName: model.modelName,
      baseUrl: model.baseUrl,
      apiKey: "",
    });
    setShowAddModel(true);
  };

const handleUpdateModel = () => {
    if (!editingModelId) return;

    void updateLLMModel(editingModelId, modelForm)
      .then((updatedModel) => {
        setModels((items) =>
          items.map((model) => (model.id === updatedModel.id ? updatedModel : model)),
        );
        if (modelForm.apiKey) {
          setModelApiKeys((items) => ({ ...items, [updatedModel.id]: modelForm.apiKey }));
        }
        setShowAddModel(false);
        emitModelsChange();
        showToast("模型修改成功", "success");
      })
      .catch((err: Error) => {
        showToast(err.message || "修改模型失败", "error");
      });
  };

  const resetModelForm = () => {
    setModelForm(emptyModelForm);
    setEditingModelId(null);
    setShowModelApiKey(false);
  };

  const handleOpenAddModel = () => {
    resetModelForm();
    setShowAddModel(true);
  };

  const copyToClipboard = (text: string, successMessage: string) => {
    if (!text) return;

    void navigator.clipboard
      .writeText(text)
      .then(() => showToast(successMessage, "success"))
      .catch(() => showToast("复制失败", "error"));
  };

  const loadModelApiKey = (model: LLMModel) => {
    const cachedApiKey = modelApiKeys[model.id];
    if (cachedApiKey != null) return Promise.resolve(cachedApiKey);

    return getLLMModelRuntime(model.id).then((runtime) => {
      setModelApiKeys((items) => ({ ...items, [model.id]: runtime.api_key }));
      return runtime.api_key;
    });
  };

  const handleToggleModelApiKey = (model: LLMModel) => {
    const nextVisible = !visibleModelApiKeys[model.id];
    setVisibleModelApiKeys((items) => ({ ...items, [model.id]: nextVisible }));

    if (!nextVisible || !model.hasApiKey) return;

void loadModelApiKey(model)
      .catch((err: Error) => {
        setVisibleModelApiKeys((items) => ({ ...items, [model.id]: false }));
        showToast(err.message || "读取密钥失败", "error");
      });
  };

const handleCopyModelApiKey = (model: LLMModel) => {
    if (!model.hasApiKey) return;

    void loadModelApiKey(model)
      .then((apiKey) => copyToClipboard(apiKey, "密钥已复制"))
      .catch((err: Error) => {
        showToast(err.message || "复制密钥失败", "error");
      });
  };

const handleDeleteModel = () => {
    if (!deletingModel) return;

    void deleteLLMModel(deletingModel.id)
      .then(() => {
        setModels((items) => items.filter((model) => model.id !== deletingModel.id));
        setVisibleModelApiKeys((items) => removeRecordKey(items, deletingModel.id));
        setModelApiKeys((items) => removeRecordKey(items, deletingModel.id));
        setDeletingModel(null);
        emitModelsChange();
        showToast("模型已删除", "success");
      })
      .catch((err: Error) => {
        showToast(err.message || "删除模型失败", "error");
      });
  };

  const visibleModels =
    providerFilter === "全部"
      ? models
      : models.filter((model) => model.provider === providerFilter);

  const providerFilters = [
    "全部",
    ...Array.from(new Set(models.map((model) => model.provider))),
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6 backdrop-blur-sm">
      <div className="flex h-[min(840px,calc(100vh-48px))] w-[min(1180px,calc(100vw-48px))] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex h-[72px] shrink-0 items-center justify-between gap-4 border-b border-[#d2d2d7] px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#0071e3] to-[#2997ff]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 17L12 22L22 17" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 12L12 17L22 12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-[16px] font-semibold text-[#1d1d1f]">个人设置与模型配置</h2>
              <p className="truncate text-[11px] text-[#86868b]">管理模型供应商、知识库检索模型与当前会话参数</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              onClick={onClose}
              variant="ghost"
              size="icon"
              className="rounded-lg hover:bg-[#f5f5f7]"
            >
              <X size={18} className="text-[#86868b]" />
            </Button>
          </div>
        </div>

        <Tabs
          orientation="vertical"
          value={activeTab}
          onValueChange={(value) => {
            if (value) setActiveTab(value as TabId);
          }}
          className="flex min-h-0 flex-1 gap-0 overflow-hidden"
        >
          <aside className="w-[220px] shrink-0 overflow-y-auto bg-[#f5f5f7] p-3">
            <TabsList className="w-full items-stretch justify-start gap-0.5 rounded-none bg-transparent p-0">
              {tabs.map((tab) => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-colors text-left ${
                    activeTab === tab.id
                      ? "bg-white text-[#1d1d1f] shadow-sm"
                      : "text-[#6e6e73] hover:bg-white/50"
                  }`}
                >
                  <tab.icon size={16} strokeWidth={1.5} />
                  <span>{tab.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </aside>

          <div className="min-w-0 flex-1 overflow-y-auto p-6">
            {activeTab === "models" && (
              <div className="space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-semibold text-[#1d1d1f]">模型配置</h3>
                    <p className="mt-0.5 text-[12px] text-[#86868b]">
                      手动添加模型供应商、模型名称、Base URL 与 API KEY。
                    </p>
                  </div>
                  <Button
                    onClick={handleOpenAddModel}
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
                        <TableHead className="w-[14%] px-4 py-3 text-[11px] uppercase tracking-wide text-[#86868b]">提供商</TableHead>
                        <TableHead className="w-[20%] px-4 py-3 text-[11px] uppercase tracking-wide text-[#86868b]">模型名称</TableHead>
                        <TableHead className="w-[28%] px-4 py-3 text-[11px] uppercase tracking-wide text-[#86868b]">端点 (Base URL)</TableHead>
                        <TableHead className="w-[24%] px-4 py-3 text-[11px] uppercase tracking-wide text-[#86868b]">密钥（API KEY）</TableHead>
                        <TableHead className="w-[14%] px-4 py-3 text-[11px] uppercase tracking-wide text-[#86868b]">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleModels.map((model) => (
                        <TableRow key={model.id} className="group/model-row border-b border-[#f5f5f7] last:border-0 hover:bg-[#f5f5f7]">
                          <TableCell className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <ProviderIcon provider={model.provider} />
                              <span className="truncate text-[13px] text-[#1d1d1f]" title={model.provider}>{model.provider}</span>
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-3 text-[13px] text-[#1d1d1f]">
                            <div className="grid grid-cols-[minmax(0,1fr)_24px] items-center gap-2">
                              <span className="truncate" title={model.modelName}>{model.modelName}</span>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(model.modelName, "模型名称已复制")}
                                className={tableIconButtonClass}
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
                                className={tableIconButtonClass}
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
                                  Boolean(visibleModelApiKeys[model.id]),
                                  modelApiKeys[model.id],
                                )}
                              >
                                {getApiKeyDisplay(
                                  model,
                                  Boolean(visibleModelApiKeys[model.id]),
                                  modelApiKeys[model.id],
                                )}
                              </span>
                              <div className="flex w-14 justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleToggleModelApiKey(model)}
                                  disabled={!model.hasApiKey}
                                  className={tableIconButtonClass}
                                  aria-label={visibleModelApiKeys[model.id] ? "隐藏密钥" : "显示密钥"}
                                  title={visibleModelApiKeys[model.id] ? "隐藏密钥" : "显示密钥"}
                                >
                                  <VisibilityIcon
                                    visible={Boolean(visibleModelApiKeys[model.id])}
                                    size={14}
                                  />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleCopyModelApiKey(model)}
                                  disabled={!model.hasApiKey}
                                  className={tableIconButtonClass}
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
                                    <Menu.Item
                                      onClick={() => handleEditModel(model)}
                                      className={menuItemClass}
                                    >
                                      <Wrench size={14} strokeWidth={1.6} />
                                      <span>修改</span>
                                    </Menu.Item>
                                    <Menu.Item
                                      onClick={() => setDeletingModel(model)}
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
            )}

            {activeTab === "kb" && (
              <div className="space-y-6">
                <h3 className="text-[15px] font-semibold text-[#1d1d1f]">知识库配置</h3>

                <div className="grid min-w-0 grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <label className="text-[12px] font-medium text-[#86868b] mb-2 block">Embedding 模型</label>
                      <Select defaultValue="text-embedding-3-large">
                        <SelectTrigger
                          aria-label="选择 Embedding 模型"
                          className="h-10 w-full rounded-xl border-[#d2d2d7] bg-white px-4 text-[13px]"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-[#d2d2d7]">
                          <SelectGroup>
                            <SelectItem value="text-embedding-3-large">
                              text-embedding-3-large
                            </SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-[#f5f5f7] flex items-center justify-center">
                        <span className="text-[10px] font-bold">O</span>
                      </div>
                      <div>
                        <p className="text-[12px] text-[#1d1d1f]">ChatGPT</p>
                        <p className="text-[11px] text-[#86868b]">向量维度 3072</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] text-[#86868b] mb-1 block">Chunk 大小</label>
                        <Input type="text" defaultValue="1000" className="h-10 rounded-xl border-[#d2d2d7] text-[13px]" />
                      </div>
                      <div>
                        <label className="text-[11px] text-[#86868b] mb-1 block">重叠大小</label>
                        <Input type="text" defaultValue="200" className="h-10 rounded-xl border-[#d2d2d7] text-[13px]" />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="text-[12px] font-medium text-[#86868b] mb-2 block">Reranker 模型</label>
                      <Select defaultValue="bge-reranker-v2-m3">
                        <SelectTrigger
                          aria-label="选择 Reranker 模型"
                          className="h-10 w-full rounded-xl border-[#d2d2d7] bg-white px-4 text-[13px]"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-[#d2d2d7]">
                          <SelectGroup>
                            <SelectItem value="bge-reranker-v2-m3">
                              bge-reranker-v2-m3
                            </SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-[#f5f5f7] flex items-center justify-center">
                        <span className="text-[10px] font-bold">B</span>
                      </div>
                      <div>
                        <p className="text-[12px] text-[#1d1d1f]">BAAI</p>
                        <p className="text-[11px] text-[#86868b]">中文优化重排序</p>
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] text-[#86868b] mb-1 block">Top-K</label>
                      <Input type="text" defaultValue="10" className="h-10 rounded-xl border-[#d2d2d7] text-[13px]" />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-[12px] font-medium text-[#86868b] mb-3 block">检索模式</label>
                  <div className="flex items-center gap-3">
                    {["向量检索", "混合检索", "向量 + reranker"].map((mode, idx) => (
                      <Button
                        key={mode}
                        variant={idx === 2 ? "default" : "secondary"}
                        className={`px-4 py-2 rounded-xl text-[13px] font-medium transition-colors ${
                          idx === 2
                            ? "bg-[#0071e3] text-white"
                            : "bg-[#f5f5f7] text-[#6e6e73] hover:bg-[#e8e8ed]"
                        }`}
                      >
                        {mode}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "session" && (
              <div className="space-y-6">
                <h3 className="text-[15px] font-semibold text-[#1d1d1f]">当前会话模型配置</h3>

                <div>
                  <label className="text-[12px] font-medium text-[#86868b] mb-2 block">预设模板</label>
                  <div className="flex items-center gap-2">
                    {["研究分析", "知识问答", "代码助手", "报告生成"].map((t, idx) => (
                      <Button
                        key={t}
                        variant={idx === 0 ? "default" : "secondary"}
                        size="sm"
                        className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                          idx === 0
                            ? "bg-[#0071e3] text-white"
                            : "bg-[#f5f5f7] text-[#6e6e73] hover:bg-[#e8e8ed]"
                        }`}
                      >
                        {t}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="grid min-w-0 grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <label className="text-[12px] text-[#86868b] mb-1.5 block">推理模型</label>
                      <Select defaultValue="claude-3.7-sonnet">
                        <SelectTrigger
                          aria-label="选择推理模型"
                          className="h-10 w-full rounded-xl border-[#d2d2d7] bg-white px-4 text-[13px]"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-[#d2d2d7]">
                          <SelectGroup>
                            <SelectItem value="claude-3.7-sonnet">
                              claude-3.7-sonnet
                            </SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-[12px] text-[#86868b] mb-1.5 block">温度</label>
                        <div className="flex items-center gap-2">
                          <Slider
                            min={0}
                            max={2}
                            step={0.1}
                            defaultValue={[0.2]}
                            className="flex-1"
                          />
                          <span className="text-[12px] text-[#1d1d1f] w-8">0.2</span>
                        </div>
                      </div>
                      <div>
                        <label className="text-[12px] text-[#86868b] mb-1.5 block">Max Tokens</label>
                        <Input type="text" defaultValue="8192" className="h-10 rounded-xl border-[#d2d2d7] text-[13px]" />
                      </div>
                      <div>
                        <label className="text-[12px] text-[#86868b] mb-1.5 block">上下文长度</label>
                        <Select defaultValue="128k">
                          <SelectTrigger
                            aria-label="选择上下文长度"
                            className="h-10 w-full rounded-xl border-[#d2d2d7] bg-white px-4 text-[13px]"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl border-[#d2d2d7]">
                            <SelectGroup>
                              <SelectItem value="128k">128k</SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <label className="flex items-center gap-2">
                        <Switch defaultChecked />
                        <span className="text-[13px] text-[#1d1d1f]">工具调用</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <Switch defaultChecked />
                        <span className="text-[13px] text-[#1d1d1f]">流式输出</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <Switch />
                        <span className="text-[13px] text-[#1d1d1f]">JSON 模式</span>
                      </label>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-[12px] text-[#86868b] mb-1.5 block">系统提示词模板</label>
                  <Textarea
                    defaultValue="你是 FeedMind AI 助手，专注于为用户提供准确、深入、结构化的分析与建议。请基于可用信息进行回答，必要时引用来源。"
                    rows={4}
                    className="w-full px-4 py-3 rounded-xl border border-[#d2d2d7] text-[13px] text-[#1d1d1f] resize-none focus:outline-none focus:border-[#0071e3]"
                  />
                </div>
              </div>
            )}

            {activeTab === "account" && (
              <div className="space-y-6">
                <h3 className="text-[15px] font-semibold text-[#1d1d1f]">账号与偏好</h3>
                <div className="flex items-center gap-4 p-4 rounded-2xl bg-[#f5f5f7]">
                  <div className="w-14 h-14 rounded-full bg-[#0071e3] flex items-center justify-center text-white text-[20px] font-semibold">
                    Z
                  </div>
                  <div>
                    <p className="text-[15px] font-semibold text-[#1d1d1f]">Zack</p>
                    <p className="text-[13px] text-[#86868b]">zack@example.com</p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "security" && (
              <div className="space-y-6">
                <h3 className="text-[15px] font-semibold text-[#1d1d1f]">安全与密钥</h3>
                <div className="p-6 rounded-2xl bg-[#f5f5f7] text-center">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[#0071e3]/10 flex items-center justify-center">
                    <Shield size={24} className="text-[#0071e3]" />
                  </div>
                  <h4 className="text-[15px] font-semibold text-[#1d1d1f] mb-1">隐私与安全</h4>
                  <p className="text-[13px] text-[#86868b]">本地化识别与脱敏控制，助力数据安全。</p>
                </div>
              </div>
            )}
          </div>
        </Tabs>

        <Dialog
          open={showAddModel}
          onOpenChange={setShowAddModel}
          onOpenChangeComplete={(value) => {
            if (!value) resetModelForm();
          }}
        >
          <DialogContent className="max-w-[520px] gap-0 rounded-2xl bg-white p-0 text-[#1d1d1f]">
            <DialogHeader className="border-b border-[#d2d2d7] px-5 py-4">
              <DialogTitle className="text-[15px] font-semibold">
                {editingModelId ? "修改模型" : "添加模型"}
              </DialogTitle>
              <DialogDescription className="text-[12px] text-[#86868b]">
                配置供应商、模型名称、端点和密钥。
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3 px-5 py-5">
              <div className="col-span-2">
                <label className="mb-1.5 block text-[12px] font-medium text-[#6e6e73]">供应商</label>
                <div className="grid grid-cols-[40px_minmax(0,1fr)] items-center gap-2">
                  <div className="grid h-10 w-10 place-items-center rounded-xl border border-[#d2d2d7] bg-[#fbfbfd]">
                    <ProviderIcon provider={modelForm.provider} size={24} />
                  </div>
                  <Select
                    value={modelForm.provider}
                    onValueChange={(value) => {
                      if (value) setModelForm((form) => ({ ...form, provider: value }));
                    }}
                  >
                    <SelectTrigger
                      aria-label="选择供应商"
                      className="h-10 min-h-10 w-full rounded-xl border-[#d2d2d7] bg-white px-3 py-0 text-[13px]"
                    >
                      <SelectValue placeholder="选择供应商" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-[#d2d2d7]">
                      <SelectGroup>
                        {modelProviders.map((provider) => (
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
                <label className="mb-1.5 block text-[12px] font-medium text-[#6e6e73]">模型名称</label>
                <Input
                  value={modelForm.modelName}
                  onChange={(event) =>
                    setModelForm((form) => ({ ...form, modelName: event.target.value }))
                  }
                  placeholder="例如deepseek-ai/deepseek-v4-flash"
                  className="h-10 rounded-xl border-[#d2d2d7] text-[13px]"
                />
              </div>
              <div className="col-span-2">
                <label className="mb-1.5 block text-[12px] font-medium text-[#6e6e73]">端点（BASE URL）</label>
                <Input
                  value={modelForm.baseUrl}
                  onChange={(event) =>
                    setModelForm((form) => ({ ...form, baseUrl: event.target.value }))
                  }
                  placeholder="例如https://api.deepseek.com"
                  className="h-10 rounded-xl border-[#d2d2d7] text-[13px]"
                />
              </div>
              <div className="col-span-2">
                <label className="mb-1.5 block text-[12px] font-medium text-[#6e6e73]">密钥（API KEY）</label>
                <div className="relative">
                  <Input
                    value={modelForm.apiKey}
                    onChange={(event) =>
                      setModelForm((form) => ({ ...form, apiKey: event.target.value }))
                    }
                    placeholder={editingModelId ? "留空则保留当前密钥" : "例如sk-..."}
                    type={showModelApiKey ? "text" : "password"}
                    className="h-10 rounded-xl border-[#d2d2d7] pr-10 text-[13px]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowModelApiKey((visible) => !visible)}
                    className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-[#86868b] transition-colors hover:bg-[#f5f5f7] hover:text-[#1d1d1f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3]/30"
                    aria-label={showModelApiKey ? "隐藏密钥" : "显示密钥"}
                    title={showModelApiKey ? "隐藏密钥" : "显示密钥"}
                  >
                    <VisibilityIcon visible={showModelApiKey} size={15} />
                  </button>
                </div>
              </div>
            </div>
            <DialogFooter className="mx-0 mb-0 rounded-b-2xl border-t border-[#d2d2d7] bg-[#fbfbfd] px-5 py-4">
              <Button
                onClick={() => setShowAddModel(false)}
                variant="ghost"
                className="rounded-xl px-4 text-[13px]"
              >
                取消
              </Button>
              <Button
                onClick={editingModelId ? handleUpdateModel : handleAddModel}
                disabled={!modelForm.modelName}
                className="rounded-xl bg-[#0071e3] px-4 text-[13px] text-white hover:bg-[#0066cc] disabled:cursor-not-allowed disabled:bg-[#d2d2d7]"
              >
                {editingModelId ? "保存修改" : "添加模型"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={deletingModel != null} onOpenChange={(value) => {
          if (!value) setDeletingModel(null);
        }}>
          <DialogContent className="max-w-[420px] gap-0 rounded-2xl bg-white p-0 text-[#1d1d1f]">
            <DialogHeader className="border-b border-[#d2d2d7] px-5 py-4">
              <DialogTitle className="text-[15px] font-semibold">删除模型</DialogTitle>
              <DialogDescription className="text-[12px] text-[#86868b]">
                删除后该模型将从配置列表中移除。
              </DialogDescription>
            </DialogHeader>
            <div className="px-5 py-5 text-[13px] text-[#1d1d1f]">
              确认删除模型“{deletingModel?.modelName}”吗？
            </div>
            <DialogFooter className="mx-0 mb-0 rounded-b-2xl border-t border-[#d2d2d7] bg-[#fbfbfd] px-5 py-4">
              <Button
                onClick={() => setDeletingModel(null)}
                variant="ghost"
                className="rounded-xl px-4 text-[13px]"
              >
                取消
              </Button>
              <Button
                onClick={handleDeleteModel}
                className="rounded-xl bg-red-500 px-4 text-[13px] text-white hover:bg-red-600"
              >
                确认删除
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="flex h-[68px] shrink-0 items-center justify-end border-t border-[#d2d2d7] bg-white px-6">
          <Button
            onClick={onClose}
            variant="ghost"
            className="px-5 py-2 rounded-xl text-[13px] font-medium text-[#1d1d1f] hover:bg-[#f5f5f7] transition-colors"
          >
            关闭
          </Button>
        </div>
      </div>
    </div>
  );
}
