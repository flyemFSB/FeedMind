"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus, X } from "lucide-react";
import { motion } from "motion/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Thread } from "@/components/chat/thread";
import { useChatContext } from "@/lib/chat/chat-context";
import { useChatSessions } from "@/lib/hooks/use-chats";
import { useLLMModels, useSelectedLLMModel, useSetSelectedLLMModel } from "@/lib/hooks/use-llms";
import { persistSelectedFeedMindModel, setSelectedFeedMindModelId } from "@/lib/api/agent";
import { ProviderIcon } from "@/components/settings/provider-icon";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "react-i18next";

interface AgentDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * AgentDrawer — 右侧划出的竖向聊天抽屉
 * - 不使用 Sheet/modal 遮罩，而是通过动画宽度挤占主内容区
 * - 宽度 420px，适合并排阅读 Wiki + 对话
 * - 标题栏提供会话切换 + 模型选择 + 新建会话 + 关闭按钮
 * - Escape 键关闭
 */
export function AgentDrawer({ open, onOpenChange }: AgentDrawerProps) {
  const { t } = useTranslation();
  const { createNewSession, switchSession, activeThreadId } = useChatContext();
  const { data: sessions = [] } = useChatSessions();
  const drawerRef = useRef<HTMLDivElement>(null);

  const currentSession = sessions.find((s) => s.id === activeThreadId);
  const currentLabel = currentSession?.title || t("common.newChat");

  // Escape 键关闭
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  // 失去焦点时聚焦抽屉以便 Escape 生效
  useEffect(() => {
    if (open) drawerRef.current?.focus();
  }, [open]);

  return (
    <motion.div
      ref={drawerRef}
      tabIndex={-1}
      animate={{ width: open ? 420 : 0 }}
      initial={false}
      transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
      className="overflow-hidden border-l border-editorial-hairline bg-editorial-surface-card outline-none"
    >
      <div className="flex h-full w-[min(420px,100vw)] flex-col">
        {/* 标题栏 */}
        <div className="flex h-14 shrink-0 items-center gap-1.5 border-b border-editorial-hairline pl-3 pr-2">
          {/* 会话切换 */}
          <DropdownMenu>
            <DropdownMenuTrigger className="flex min-w-0 max-w-[120px] items-center gap-1 rounded-md px-1.5 py-0.5 text-editorial-ink transition-colors hover:bg-editorial-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editorial-hairline-strong">
              <span className="truncate text-[13px] font-medium leading-tight">{currentLabel}</span>
              <ChevronDown size={12} className="shrink-0 text-editorial-ink-muted" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[220px] rounded-xl p-1.5">
              {sessions.length === 0 ? (
                <div className="px-3 py-2 text-[12px] text-editorial-ink-muted">
                  {t("chat.noSessions")}
                </div>
              ) : (
                sessions.map((session) => (
                  <DropdownMenuItem
                    key={session.id}
                    onClick={() => switchSession(session.id)}
                    className="rounded-lg text-[12px]"
                  >
                    <span className="truncate">
                      {session.title || t("chat.sessionTitleDefault")}
                    </span>
                  </DropdownMenuItem>
                ))
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => createNewSession()}
                className="flex items-center gap-2 rounded-lg text-[12px] text-editorial-ink"
              >
                <Plus size={14} />
                {t("common.newChat")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* 右侧：模型选择 + 操作按钮 */}
          <div className="ml-auto flex items-center gap-0.5">
            <CompactModelSelector />
            <motion.button
              type="button"
              onClick={() => createNewSession()}
              whileTap={{ scale: 0.92 }}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-editorial-ink-soft transition-colors hover:bg-editorial-surface-soft hover:text-editorial-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editorial-hairline-strong"
              aria-label={t("common.newChat")}
              title={t("common.newChat")}
            >
              <Plus size={14} strokeWidth={2} />
            </motion.button>
            <motion.button
              type="button"
              onClick={() => onOpenChange(false)}
              whileTap={{ scale: 0.92 }}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-editorial-ink-soft transition-colors hover:bg-editorial-surface-soft hover:text-editorial-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editorial-hairline-strong"
              aria-label={t("common.close")}
              title={t("common.close")}
            >
              <X size={14} strokeWidth={2} />
            </motion.button>
          </div>
        </div>

        {/* 聊天线程 */}
        <div className="flex min-h-0 flex-1">
          <Thread
            className="bg-editorial-surface-card"
            contentClassName="px-4 pt-4 pb-[180px] max-w-full"
          />
        </div>
      </div>
    </motion.div>
  );
}

/**
 * CompactModelSelector — 紧凑型模型选择器
 * 用于 Agent 抽屉标题栏，占用空间小
 */
function CompactModelSelector() {
  const { t } = useTranslation();
  const { data: models = [], isLoading } = useLLMModels();
  const { data: selectedModelId = "" } = useSelectedLLMModel();
  const setSelectedMutation = useSetSelectedLLMModel();
  const [selectedModel, setSelectedModel] = useState("");

  useEffect(() => {
    if (selectedModelId) setSelectedModel(selectedModelId);
  }, [selectedModelId]);

  const handleChange = async (modelId: string | null) => {
    if (!modelId) return;
    setSelectedModel(modelId);
    await setSelectedMutation.mutateAsync(modelId);
    await persistSelectedFeedMindModel(modelId);

    const model = models.find((m) => m.id === modelId);
    if (model?.modelId) {
      setSelectedFeedMindModelId(model.modelId);
    }
  };

  if (isLoading) {
    return <Skeleton className="h-7 w-[100px] rounded-lg" />;
  }

  const hasModels = models.length > 0;
  const currentModel = models.find((m) => m.id === selectedModel);

  return (
    <Select value={hasModels ? selectedModel : ""} onValueChange={handleChange}>
      <SelectTrigger
        aria-label={t("settings.selectSessionModel")}
        className="h-7 max-w-[130px] rounded-lg border-editorial-hairline bg-editorial-surface-card px-2 text-[11px] text-editorial-ink-soft hover:bg-editorial-surface-soft hover:text-editorial-ink"
        disabled={!hasModels}
      >
        <SelectValue placeholder={t("settings.noModels")}>
          {() =>
            currentModel ? (
              <span className="flex items-center gap-1.5 truncate">
                <ProviderIcon provider={currentModel.provider} size={12} />
                <span className="truncate">{currentModel.modelName}</span>
              </span>
            ) : (
              <span className="text-editorial-ink-muted">{t("settings.noModels")}</span>
            )
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="end" className="rounded-xl border-editorial-hairline min-w-[160px]">
        <SelectGroup>
          {models.map((model) => (
            <SelectItem key={model.id} value={model.id} className="text-[12px]">
              <span className="flex items-center gap-2">
                <ProviderIcon provider={model.provider} size={14} />
                <span>{model.modelName}</span>
              </span>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
