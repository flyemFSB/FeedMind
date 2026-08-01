"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { motion } from "motion/react";
import { ChevronDown, GripVertical, Plus, Trash2, X } from "lucide-react";
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
import { useChatSessions, useDeleteChatSession } from "@/lib/hooks/use-chats";
import { useModels, useSelectedModel, useSetSelectedModel } from "@/lib/hooks/use-models";
import { persistSelectedFeedMindModel, setSelectedFeedMindModelId } from "@/lib/api/agent";
import { ProviderIcon } from "@/components/settings/provider-icon";
import { Skeleton } from "@/components/ui/skeleton";
import {
  drawerVariants,
  motionInstant,
  motionLayoutTransition,
  motionPressTransition,
} from "@/lib/motion";
import { useTranslation } from "react-i18next";

interface AgentDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AgentDrawer({ open, onOpenChange }: AgentDrawerProps) {
  const { t } = useTranslation();
  const { createNewSession, switchSession, activeThreadId, clearSession } = useChatContext();
  const { data: sessions = [] } = useChatSessions();
  const deleteMutation = useDeleteChatSession();
  const drawerRef = useRef<HTMLDivElement>(null);
  const [instantClose, setInstantClose] = useState(false);

  const [isDesktop, setIsDesktop] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const [drawerWidth, setDrawerWidth] = useState(() => {
    try {
      const saved = localStorage.getItem("feedmind:agent-drawer-width");
      if (saved) {
        const n = Number(saved);
        return Math.min(Math.max(n, 320), 640);
      }
    } catch {
      /* ignore */
    }
    return 400;
  });
  const drawerWidthRef = useRef(drawerWidth);
  drawerWidthRef.current = drawerWidth;

  useEffect(() => {
    localStorage.setItem("feedmind:agent-drawer-width", String(drawerWidth));
  }, [drawerWidth]);

  const handleResizePointerDown = useCallback((e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = drawerWidthRef.current;

    const handlePointerMove = (event: globalThis.PointerEvent) => {
      const newWidth = startWidth - (event.clientX - startX);
      const clamped = Math.min(Math.max(newWidth, 320), 640);
      setDrawerWidth(clamped);
    };

    const handlePointerUp = () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("pointercancel", handlePointerUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
    document.addEventListener("pointercancel", handlePointerUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  const currentSession = sessions.find((s) => s.agent_thread_id === activeThreadId);
  const currentLabel = currentSession?.title || t("common.newChat");

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setInstantClose(true);
        onOpenChange(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!instantClose) return;
    const frame = requestAnimationFrame(() => setInstantClose(false));
    return () => cancelAnimationFrame(frame);
  }, [instantClose]);

  useEffect(() => {
    if (open) drawerRef.current?.focus();
  }, [open]);

  const expandedWidth = isDesktop
    ? drawerWidth
    : Math.min(400, Math.max((typeof window === "undefined" ? 400 : window.innerWidth) - 48, 0));

  return (
    <motion.div
      ref={drawerRef}
      tabIndex={-1}
      data-island="agent"
      data-state={open ? "open" : "closed"}
      aria-hidden={!open}
      inert={!open}
      initial={false}
      animate={{ width: open ? expandedWidth : 0 }}
      transition={instantClose ? motionInstant : motionLayoutTransition}
      className={`relative shrink-0 overflow-hidden border bg-editorial-surface-soft outline-none max-lg:fixed max-lg:bottom-0 max-lg:right-0 max-lg:top-0 max-lg:z-40 max-lg:max-w-[calc(100vw-48px)] ${
        open
          ? "my-2 mr-2 rounded-xl border-editorial-hairline shadow-[0_1px_3px_rgba(55,53,45,0.06)] max-lg:my-0 max-lg:mr-0 max-lg:rounded-l-xl max-lg:border-r-0 max-lg:shadow-[-8px_0_18px_-14px_rgba(55,53,45,0.18)]"
          : "pointer-events-none my-0 mr-0 rounded-none border-transparent shadow-none"
      }`}
    >
      {open && (
        <motion.button
          type="button"
          whileHover={{ scale: 1.04, opacity: 1 }}
          whileTap={{ scale: 0.96 }}
          className="absolute left-1 top-1/2 z-50 hidden h-11 w-6 -translate-y-1/2 cursor-col-resize items-center justify-center rounded-md border border-editorial-hairline bg-editorial-surface-card text-editorial-ink-muted opacity-70 hover:bg-editorial-surface-strong hover:text-editorial-ink focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent lg:flex"
          onPointerDown={handleResizePointerDown}
          onDoubleClick={() => setDrawerWidth(400)}
          aria-label="拖动调整 Agent 面板宽度，双击恢复默认宽度"
          title="拖动调整宽度 · 双击恢复默认"
        >
          <GripVertical size={14} strokeWidth={1.8} />
        </motion.button>
      )}
      <motion.div
        data-instant-close={instantClose ? "true" : undefined}
        className="flex h-full w-full max-w-[calc(100vw-48px)] flex-col overflow-hidden"
        initial="closed"
        animate={open ? "open" : "closed"}
        variants={drawerVariants}
      >
        <div className="flex h-12 shrink-0 items-center gap-1.5 border-b border-editorial-hairline-soft bg-editorial-surface-soft pl-4 pr-3">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex min-w-0 max-w-[132px] items-center gap-1 rounded-md px-1.5 py-1 text-editorial-ink hover:bg-editorial-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent">
              <span className="truncate text-[13px] font-medium leading-tight">{currentLabel}</span>
              <ChevronDown size={12} className="shrink-0 text-editorial-ink-muted" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[220px] p-1.5">
              {sessions.length === 0 ? (
                <div className="px-3 py-2 text-[12px] text-editorial-ink-muted">
                  {t("chat.noSessions")}
                </div>
              ) : (
                sessions.map((session) => (
                  <DropdownMenuItem
                    key={session.agent_thread_id}
                    onClick={() => switchSession(session.agent_thread_id)}
                    className="group flex items-center rounded-md p-0 text-[12px]"
                  >
                    <span className="flex-1 truncate px-2 py-1.5">
                      {session.title || t("chat.sessionTitleDefault")}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (session.agent_thread_id === activeThreadId) {
                          clearSession();
                        }
                        deleteMutation.mutate(session.agent_thread_id);
                      }}
                      className="mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-editorial-ink-muted opacity-0 hover:bg-editorial-surface-strong hover:text-editorial-semantic-error group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100"
                      title={t("common.delete")}
                    >
                      <Trash2 size={12} />
                    </button>
                  </DropdownMenuItem>
                ))
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => createNewSession()}
                className="flex items-center gap-2 rounded-md text-[12px] text-editorial-ink"
              >
                <Plus size={14} />
                {t("common.newChat")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="ml-auto flex items-center">
            <CompactModelSelector />
            {!isDesktop && (
              <motion.button
                type="button"
                onClick={() => onOpenChange(false)}
                whileHover={{ scale: 1.04, opacity: 1 }}
                whileTap={{ scale: 0.94 }}
                transition={motionPressTransition}
                className="ml-1 flex size-7 items-center justify-center rounded-md text-editorial-ink-muted opacity-80 hover:bg-editorial-surface-strong hover:text-editorial-ink focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                aria-label="关闭 Agent 面板"
                title="关闭 Agent 面板"
              >
                <X size={15} />
              </motion.button>
            )}
          </div>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1">
          <Thread className="bg-editorial-surface-card" />
        </div>
      </motion.div>
    </motion.div>
  );
}

function CompactModelSelector() {
  const { t } = useTranslation();
  const { data: models = [], isLoading } = useModels("chat");
  const { data: selectedModelId = "" } = useSelectedModel("chat");
  const setSelectedMutation = useSetSelectedModel("chat");
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
    return <Skeleton className="h-7 w-[100px] rounded-md" />;
  }

  const hasModels = models.length > 0;
  const currentModel = models.find((m) => m.id === selectedModel);

  return (
    <Select value={hasModels ? selectedModel : ""} onValueChange={handleChange}>
      <SelectTrigger
        aria-label={t("settings.selectSessionModel")}
        className="h-7 max-w-[130px] rounded-md border-editorial-hairline bg-editorial-surface-card px-2 text-[12px] text-editorial-ink-soft hover:bg-editorial-surface-soft hover:text-editorial-ink"
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
      <SelectContent align="end" className="border-editorial-hairline min-w-[160px]">
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
