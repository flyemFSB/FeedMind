import { useCallback, useEffect, useEffectEvent, useRef, useState, type PointerEvent } from "react";
import { m } from "motion/react";
import { Check, ChevronDown, MessageSquare, Plus, Search, Trash2, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Thread } from "@/app/agent-drawer/thread";
import { useChatContext } from "@/app/agent-drawer/chat-context";
import { useChatSessions } from "@/lib/hooks/use-chats";
import { useChatSessionDelete } from "@/lib/hooks/use-chat-session-delete";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { drawerVariants, motionInstant, motionLayoutTransition } from "@/lib/motion";
import { formatDateTime } from "@/lib/format";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface AgentDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AgentDrawer({ open, onOpenChange }: AgentDrawerProps) {
  const { t } = useTranslation();
  const { createNewSession, switchSession, activeThreadId } = useChatContext();
  const { data: sessions = [] } = useChatSessions();
  const deleteConfirm = useChatSessionDelete();
  const drawerRef = useRef<HTMLDivElement>(null);
  const [instantClose, setInstantClose] = useState(false);
  // 会话下拉菜单的 open 受控，删除按钮需要先关菜单再弹确认框
  const [menuOpen, setMenuOpen] = useState(false);
  const [sessionSearch, setSessionSearch] = useState("");

  const handleMenuOpenChange = useCallback((nextOpen: boolean) => {
    setMenuOpen(nextOpen);
    if (!nextOpen) setSessionSearch("");
  }, []);

  // Thread 首次打开后才挂载，避免启动即加载聊天渲染管线（streamdown/mermaid/历史 DOM）。
  // 用渲染期按 props 调整 state（React 官方模式）替代 effect 里的 setState
  const [hasMountedThread, setHasMountedThread] = useState(open);
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setHasMountedThread(true);
  }

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
        return Math.min(Math.max(n, 400), 800);
      }
    } catch {
      /* 忽略 localStorage 读取失败，回退使用默认抽屉宽度 */
    }
    return 560;
  });

  useEffect(() => {
    localStorage.setItem("feedmind:agent-drawer-width", String(drawerWidth));
  }, [drawerWidth]);

  const [isResizing, setIsResizing] = useState(false);

  const handleResizePointerDown = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      e.preventDefault();
      setIsResizing(true);
      const startX = e.clientX;
      // 拖拽起点宽度取自 state 闭包：起拖后本次手势内宽度固定，宽度变化只重建 handler 不影响进行中的拖拽
      const startWidth = drawerWidth;

      const handlePointerMove = (event: globalThis.PointerEvent) => {
        const newWidth = startWidth - (event.clientX - startX);
        const clamped = Math.min(Math.max(newWidth, 400), 800);
        setDrawerWidth(clamped);
      };

      const handlePointerUp = () => {
        document.removeEventListener("pointermove", handlePointerMove);
        document.removeEventListener("pointerup", handlePointerUp);
        document.removeEventListener("pointercancel", handlePointerUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        setIsResizing(false);
      };

      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", handlePointerUp);
      document.addEventListener("pointercancel", handlePointerUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [drawerWidth],
  );

  const currentSession = sessions.find((s) => s.agent_thread_id === activeThreadId);
  const currentLabel = currentSession?.title ?? t("common.newChat");
  const filteredSessions = sessionSearch.trim()
    ? sessions.filter((s) =>
        (s.title || t("chat.sessionTitleDefault"))
          .toLowerCase()
          .includes(sessionSearch.trim().toLowerCase()),
      )
    : sessions;

  // useEffectEvent 隔离 onOpenChange：监听器只在 open 变化时重挂，不随回调身份重订阅
  const onEscape = useEffectEvent(() => {
    setInstantClose(true);
    onOpenChange(false);
  });
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscape();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

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
    <>
      {open && isDesktop && (
        <div
          role="separator"
          tabIndex={-1}
          aria-orientation="vertical"
          aria-label="拖动调整 Agent 面板宽度，双击恢复默认宽度"
          title="拖动调整宽度 · 双击恢复默认"
          onPointerDown={handleResizePointerDown}
          onDoubleClick={() => setDrawerWidth(560)}
          className={cn(
            "group relative hidden lg:flex w-2 shrink-0 cursor-col-resize items-center justify-center -ml-2 z-20 select-none my-2 hover:bg-editorial-accent/20 rounded-full transition-colors",
            isResizing && "bg-editorial-accent/40",
          )}
        >
          <div className="h-6 w-0.5 rounded-full bg-editorial-hairline group-hover:bg-editorial-accent" />
        </div>
      )}
      <m.div
        ref={drawerRef}
        tabIndex={-1}
        data-island="agent"
        data-state={open ? "open" : "closed"}
        aria-hidden={!open}
        inert={!open}
        initial={false}
        // eslint-disable-next-line react-doctor/no-layout-property-animation -- 有界开合（用户触发的一次性抽屉动画）：桌面端 push 布局必须动 width，FLIP/layout 会拉伸文本内容
        animate={{ width: open ? expandedWidth : 0 }}
        transition={instantClose ? motionInstant : motionLayoutTransition}
        className={`relative shrink-0 overflow-hidden border bg-editorial-surface-soft outline-none max-lg:fixed max-lg:bottom-0 max-lg:right-0 max-lg:top-0 max-lg:z-40 max-lg:max-w-[calc(100vw-48px)] ${
          open
            ? "my-2 mr-2 rounded-xl border-editorial-hairline shadow-island max-lg:my-0 max-lg:mr-0 max-lg:rounded-l-xl max-lg:border-r-0 max-lg:shadow-drawer"
            : "pointer-events-none my-0 mr-0 rounded-none border-transparent shadow-none"
        }`}
      >
        <m.div
          data-instant-close={instantClose ? "true" : undefined}
          className="flex h-full w-full max-w-[calc(100vw-48px)] flex-col overflow-hidden"
          initial="closed"
          animate={open ? "open" : "closed"}
          variants={drawerVariants}
        >
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-editorial-hairline-soft bg-editorial-surface-soft px-3">
            <div className="flex min-w-0 items-center gap-1.5">
              <DropdownMenu open={menuOpen} onOpenChange={handleMenuOpenChange}>
                <DropdownMenuTrigger
                  className="flex min-w-0 max-w-[200px] sm:max-w-[260px] items-center gap-1.5 rounded-lg border border-transparent px-2 py-1 text-editorial-ink transition-colors hover:border-editorial-hairline hover:bg-editorial-surface-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                  title={currentLabel}
                >
                  <MessageSquare size={14} className="shrink-0 text-editorial-accent" />
                  <span className="truncate text-body font-medium leading-tight">
                    {currentLabel}
                  </span>
                  <ChevronDown
                    size={12}
                    className={cn(
                      "shrink-0 text-editorial-ink-muted transition-transform duration-150",
                      menuOpen && "rotate-180",
                    )}
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[300px] sm:w-[320px] p-2">
                  <div className="flex items-center justify-between px-2 py-1 text-tiny text-editorial-ink-muted">
                    <span className="font-medium text-editorial-ink">
                      {t("chat.history", "历史会话")}
                    </span>
                    <span>
                      {t("chat.sessionCount", {
                        count: sessions.length,
                        defaultValue: `${sessions.length} 个对话`,
                      })}
                    </span>
                  </div>

                  {(sessions.length > 2 || sessionSearch) && (
                    <div className="relative my-1.5 px-0.5">
                      <Search
                        size={12}
                        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-editorial-ink-muted"
                      />
                      <input
                        type="text"
                        value={sessionSearch}
                        onChange={(e) => setSessionSearch(e.target.value)}
                        placeholder={t("chat.searchSessions", "搜索会话...")}
                        className="h-7 w-full rounded-md border border-editorial-hairline bg-editorial-surface-soft pl-7 pr-2 text-xs text-editorial-ink placeholder:text-editorial-ink-muted focus:border-editorial-hairline-strong focus:outline-none focus:ring-1 focus:ring-editorial-accent/20"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key !== "Escape") {
                            e.stopPropagation();
                          }
                        }}
                      />
                    </div>
                  )}

                  <div className="max-h-64 overflow-y-auto space-y-0.5 py-0.5">
                    {filteredSessions.length === 0 ? (
                      <div className="py-4 text-center text-xs text-editorial-ink-muted">
                        {sessions.length === 0
                          ? t("chat.noSessions")
                          : t("chat.noMatchingSessions", "未找到匹配会话")}
                      </div>
                    ) : (
                      filteredSessions.map((session) => {
                        const isActive = session.agent_thread_id === activeThreadId;
                        return (
                          <DropdownMenuItem
                            key={session.agent_thread_id}
                            onClick={() => void switchSession(session.agent_thread_id)}
                            className={cn(
                              "group flex items-center justify-between rounded-lg p-2 text-xs transition-colors cursor-pointer",
                              isActive
                                ? "bg-editorial-accent-soft/60 text-editorial-ink font-medium border border-editorial-accent/25"
                                : "text-editorial-ink-soft hover:bg-editorial-surface-soft hover:text-editorial-ink border border-transparent",
                            )}
                          >
                            <div className="flex min-w-0 items-center gap-2 flex-1">
                              {isActive ? (
                                <Check size={13} className="shrink-0 text-editorial-accent" />
                              ) : (
                                <MessageSquare
                                  size={13}
                                  className="shrink-0 text-editorial-ink-muted group-hover:text-editorial-ink"
                                />
                              )}
                              <div className="flex min-w-0 flex-col flex-1">
                                <span className="truncate">
                                  {session.title || t("chat.sessionTitleDefault")}
                                </span>
                                {session.updated_at && (
                                  <span className="text-[10px] text-editorial-ink-muted/80">
                                    {formatDateTime(session.updated_at, { withDate: true })}
                                  </span>
                                )}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setMenuOpen(false);
                                deleteConfirm.setDeleteTarget(session.agent_thread_id);
                              }}
                              className="ml-1.5 flex size-6 shrink-0 items-center justify-center rounded-md text-editorial-ink-muted opacity-0 transition-opacity hover:bg-editorial-semantic-error/10 hover:text-editorial-semantic-error group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100"
                              title={t("common.delete")}
                              aria-label={t("common.delete")}
                            >
                              <Trash2 size={12} />
                            </button>
                          </DropdownMenuItem>
                        );
                      })
                    )}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* 常驻 1-Click 新建对话按钮 */}
              <button
                type="button"
                onClick={() => void createNewSession()}
                className="flex size-7 shrink-0 items-center justify-center rounded-md border border-editorial-hairline bg-editorial-surface-card text-editorial-ink-muted shadow-xs transition-colors hover:bg-editorial-surface-strong hover:text-editorial-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                title={t("common.newChat")}
                aria-label={t("common.newChat")}
              >
                <Plus size={14} />
              </button>
            </div>

            <div className="flex items-center">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="flex size-7 items-center justify-center rounded-md text-editorial-ink-muted opacity-80 hover:bg-editorial-surface-strong hover:text-editorial-ink focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                aria-label="关闭 Agent 面板"
                title="关闭 Agent 面板"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          <div className="flex min-h-0 min-w-0 flex-1">
            {hasMountedThread && <Thread className="bg-editorial-surface-card" />}
          </div>

          <DeleteConfirmDialog
            open={deleteConfirm.deleteTarget != null}
            onClose={deleteConfirm.handleClose}
            onConfirm={deleteConfirm.handleConfirm}
            title={t("chat.deleteSession")}
            description={
              deleteConfirm.deleteTarget
                ? t("chat.deleteSessionConfirm", {
                    title:
                      sessions.find((s) => s.agent_thread_id === deleteConfirm.deleteTarget)
                        ?.title ?? t("chat.sessionTitleDefault"),
                  })
                : undefined
            }
          />
        </m.div>
      </m.div>
    </>
  );
}
