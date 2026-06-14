"use client";

import { useEffect, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { BookOpen, ChevronLeft, ChevronRight, Plus, Settings } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { AssistantThreadList } from "@/components/chat/thread-list";
import { writeActiveFeedMindThreadId } from "@/lib/api/chats";
import { useTranslation } from "react-i18next";

interface SidebarProps {
  onSettingsClick: () => void;
  mobile?: boolean;
}

const SIDEBAR_EXPANDED = 260;
const SIDEBAR_COLLAPSED = 60;

export function Sidebar({ onSettingsClick, mobile = false }: SidebarProps) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("sidebar-collapsed") === "true";
    }
    return false;
  });

  useEffect(() => {
    localStorage.setItem("sidebar-collapsed", String(collapsed));
  }, [collapsed]);

  const width = collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED;

  return (
    <div className="relative flex h-full">
      <motion.aside
        initial={false}
        className={`flex h-full flex-col border-r border-editorial-hairline bg-editorial-surface-soft ${mobile ? "" : "max-md:hidden"}`}
        animate={{ width }}
        transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
      >
        {/* Logo */}
        <div className={`flex shrink-0 items-center ${collapsed ? "justify-center px-0 pt-5 pb-4" : "px-5 pt-5 pb-4"}`}>
          <Link to="/chat" className="flex items-center">
            {collapsed ? (
              <img src="/FeedMind-logo.svg" alt="FeedMind" width={28} height={28} className="shrink-0" loading="eager" decoding="async" />
            ) : (
              <img src="/FeedMind-logo-text.svg" alt="FeedMind" width={139} height={36} style={{ height: "auto" }} loading="eager" decoding="async" />
            )}
          </Link>
        </div>

        {/* New Chat button */}
        <div className={`flex shrink-0 items-center ${collapsed ? "justify-center px-0" : "px-3 pb-2"}`}>
          <button
            onClick={() => {
              writeActiveFeedMindThreadId("");
              if (pathname !== "/chat") navigate({ to: "/chat" });
            }}
            className={`flex cursor-pointer items-center justify-center gap-2 rounded-full bg-editorial-primary text-[14px] font-semibold text-editorial-ink-on-primary transition-all hover:bg-editorial-primary-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editorial-ink/30 active:translate-y-px ${collapsed ? "h-9 w-9" : "h-9 w-full px-3"}`}
          >
            <Plus size={16} strokeWidth={2} className="shrink-0" />
            {!collapsed && <span>{t("common.newChat")}</span>}
          </button>
        </div>

        {/* Wiki link */}
        <div className={`flex shrink-0 items-center ${collapsed ? "justify-center px-0" : "px-3 pb-1"}`}>
          <Link
            to="/wiki"
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[14px] font-medium transition-colors hover:bg-editorial-surface-soft ${collapsed ? "justify-center w-9" : "w-full"} ${pathname === "/wiki" ? "text-editorial-primary bg-editorial-primary/5" : "text-editorial-ink"}`}
          >
            <BookOpen size={16} strokeWidth={1.5} className="shrink-0" />
            {!collapsed && <span>{t("common.myWiki")}</span>}
          </Link>
        </div>

        {/* Thread list */}
        <div className="flex-1 overflow-hidden">
          <AnimatePresence initial={false}>
            {!collapsed ? (
              <motion.div key="expanded" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="h-full overflow-y-auto px-3">
                <div className="px-3 pb-2 pt-1">
                  <span className="text-[11px] font-medium text-editorial-ink-muted uppercase tracking-wide">{t("common.recentChats")}</span>
                </div>
                <AssistantThreadList />
              </motion.div>
            ) : (
              <div key="collapsed" />
            )}
          </AnimatePresence>
        </div>

        {/* Settings */}
        <div className={`flex shrink-0 items-center border-t border-editorial-hairline ${collapsed ? "justify-center p-1" : "p-3"}`}>
          <button
            onClick={onSettingsClick}
            className={`flex cursor-pointer items-center rounded-lg text-[14px] font-medium text-editorial-ink transition-colors hover:bg-editorial-surface-soft ${collapsed ? "justify-center h-8 w-7" : "flex-1 gap-3 px-2 py-2"}`}
            title={t("common.settings")}
          >
            <Settings size={16} strokeWidth={1.5} className="shrink-0" />
            {!collapsed && <span>{t("common.settings")}</span>}
          </button>
        </div>
      </motion.aside>

      {/* Toggle button — 固定在分割线上，垂直居中 */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute right-0 top-1/2 z-10 flex h-8 w-6 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full border border-editorial-hairline bg-editorial-surface-card text-editorial-ink-muted shadow-sm transition-colors hover:bg-editorial-surface-soft hover:text-editorial-ink"
        title={collapsed ? t("common.expandSidebar") : t("common.collapseSidebar")}
      >
        {collapsed ? <ChevronRight size={14} strokeWidth={2} /> : <ChevronLeft size={14} strokeWidth={2} />}
      </button>
    </div>
  );
}