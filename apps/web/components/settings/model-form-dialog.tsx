"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import type { LLMModel } from "@/lib/types";
import { createLLMModel, updateLLMModel } from "@/lib/api/llms";
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

const PROVIDERS = [
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
const EMPTY_FORM = { provider: "ChatGPT", modelName: "", baseUrl: "", apiKey: "" };

interface ModelFormDialogProps {
  open: boolean;
  initialModel?: LLMModel | null;
  onSubmit: () => void;
  onOpenChange: (open: boolean) => void;
}

export function ModelFormDialog({
  open,
  initialModel,
  onSubmit,
  onOpenChange,
}: ModelFormDialogProps) {
  const isEditing = initialModel != null;
  const [form, setForm] = useState(
    initialModel
      ? {
          provider: initialModel.provider,
          modelName: initialModel.modelName,
          baseUrl: initialModel.baseUrl,
          apiKey: "",
        }
      : EMPTY_FORM,
  );
  const [showKey, setShowKey] = useState(false);

  function handleSubmit() {
    const action = isEditing ? updateLLMModel(initialModel.id, form) : createLLMModel(form);
    action
      .then(() => {
        toast.success(isEditing ? "模型修改成功" : "模型添加成功");
        onSubmit();
      })
      .catch(() => {
        toast.error("操作失败");
      });
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
      <DialogContent className="max-w-[520px] gap-0 rounded-2xl bg-white p-0 text-[#1d1d1f]">
        <DialogHeader className="border-b border-[#d2d2d7] px-5 py-4">
          <DialogTitle className="text-[15px] font-semibold">
            {isEditing ? "修改模型" : "添加模型"}
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
                <ProviderIcon provider={form.provider} size={24} />
              </div>
              <Select
                value={form.provider}
                onValueChange={(value) => {
                  if (value) setForm((current) => ({ ...current, provider: value }));
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
          <div className="col-span-2">
            <label className="mb-1.5 block text-[12px] font-medium text-[#6e6e73]">模型名称</label>
            <Input
              value={form.modelName}
              onChange={(event) =>
                setForm((current) => ({ ...current, modelName: event.target.value }))
              }
              placeholder="例如 deepseek-ai/deepseek-v4-flash"
              className="h-10 rounded-xl border-[#d2d2d7] text-[13px]"
            />
          </div>
          <div className="col-span-2">
            <label className="mb-1.5 block text-[12px] font-medium text-[#6e6e73]">
              端点（BASE URL）
            </label>
            <Input
              value={form.baseUrl}
              onChange={(event) =>
                setForm((current) => ({ ...current, baseUrl: event.target.value }))
              }
              placeholder="例如 https://api.deepseek.com"
              className="h-10 rounded-xl border-[#d2d2d7] text-[13px]"
            />
          </div>
          <div className="col-span-2">
            <label className="mb-1.5 block text-[12px] font-medium text-[#6e6e73]">
              密钥（API KEY）
            </label>
            <div className="relative">
              <Input
                value={form.apiKey}
                onChange={(event) =>
                  setForm((current) => ({ ...current, apiKey: event.target.value }))
                }
                placeholder={isEditing ? "留空则保留当前密钥" : "例如 sk-..."}
                type={showKey ? "text" : "password"}
                className="h-10 rounded-xl border-[#d2d2d7] pr-10 text-[13px]"
              />
              <button
                type="button"
                onClick={() => setShowKey((value) => !value)}
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-[#86868b] transition-colors hover:bg-[#f5f5f7] hover:text-[#1d1d1f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3]/30"
                aria-label={showKey ? "隐藏密钥" : "显示密钥"}
                title={showKey ? "隐藏密钥" : "显示密钥"}
              >
                {showKey ? (
                  <EyeOff size={15} strokeWidth={1.7} />
                ) : (
                  <Eye size={15} strokeWidth={1.7} />
                )}
              </button>
            </div>
          </div>
        </div>
        <DialogFooter className="mx-0 mb-0 rounded-b-2xl border-t border-[#d2d2d7] bg-[#fbfbfd] px-5 py-4">
          <Button onClick={handleClose} variant="ghost" className="rounded-xl px-4 text-[13px]">
            取消
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!form.modelName}
            className="rounded-xl bg-[#0071e3] px-4 text-[13px] text-white hover:bg-[#0066cc] disabled:cursor-not-allowed disabled:bg-[#d2d2d7]"
          >
            {isEditing ? "保存修改" : "添加模型"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
