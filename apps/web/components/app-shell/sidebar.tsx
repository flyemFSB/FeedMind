"use client";

import { useEffect, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { BookOpen, ChevronLeft, ChevronRight, Plus, Settings } from "lucide-react";
import { motion } from "motion/react";
import { AssistantThreadList } from "@/components/chat/thread-list";
import { writeActiveFeedMindThreadId } from "@/lib/api/chats";
import { useTranslation } from "react-i18next";

interface SidebarProps {
  onSettingsClick: () => void;
  mobile?: boolean;
}

export function Sidebar({ onSettingsClick, mobile = false }: SidebarProps) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("sidebar-collapsed");
    if (stored === "true") setCollapsed(true);
  }, []);

  useEffect(() => {
    localStorage.setItem("sidebar-collapsed", String(collapsed));
  }, [collapsed]);
  const asideClassName = `flex h-full flex-col border-r border-editorial-hairline bg-editorial-canvas transition-all duration-200 ${
    collapsed ? "w-[60px] min-w-[60px]" : "w-[260px] min-w-[260px]"
  } ${mobile ? "" : "max-md:hidden"}`;

  return (
    <motion.aside
      className={asideClassName}
      animate={{ width: collapsed ? 60 : 260 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      <div className="px-5 pt-5 pb-4">
        <Link to="/chat" className="flex items-center gap-2.5">
          {collapsed ? (
            <img
              src="/FeedMind-logo.svg"
              alt="FeedMind"
              width={28}
              height={28}
              loading="eager"
              decoding="async"
            />
          ) : (
            <img
              src="/FeedMind-logo-text.svg"
              alt="FeedMind"
              width={139}
              height={36}
              loading="eager"
              decoding="async"
              style={{ height: "auto" }}
            />
          )}
        </Link>
      </div>

      <nav className="px-3 pb-2">
        <button
          onClick={() => {
            writeActiveFeedMindThreadId("");
            if (pathname !== "/chat") navigate({ to: "/chat" });
          }}
          className="flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-editorial-primary px-3 text-[14px] font-semibold text-editorial-ink-on-primary transition-all hover:bg-editorial-primary-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editorial-ink/30 active:translate-y-px"
        >
          <Plus size={16} strokeWidth={2} />
          {!collapsed && <span>{t("common.newChat")}</span>}
        </button>
      </nav>

      <div className="px-3 pb-1">
        <Link
          to="/wiki"
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[14px] font-medium transition-colors hover:bg-editorial-surface-soft ${
            collapsed ? "justify-center" : ""
          } ${
            pathname === "/wiki"
              ? "text-editorial-primary bg-editorial-primary/5"
              : "text-editorial-ink"
          }`}
        >
          <BookOpen size={16} strokeWidth={1.5} />
          {!collapsed && <span>{t("common.myWiki")}</span>}
        </Link>
      </div>

      {!collapsed ? (
        <div className="flex-1 overflow-y-auto px-3">
          <div className="px-3 pb-2 pt-1">
            <span className="text-[11px] font-medium text-editorial-ink-muted uppercase tracking-wide">
              {t("common.recentChats")}
            </span>
          </div>
          <AssistantThreadList />
        </div>
      ) : (
        <div className="flex-1" />
      )}

      <div className="flex items-center p-3 border-t border-editorial-hairline">
        <button
          onClick={onSettingsClick}
          className="flex items-center gap-3 rounded-lg px-2 py-2 text-[14px] font-medium text-editorial-ink transition-colors hover:bg-editorial-surface-soft flex-1"
        >
          <Settings size={16} strokeWidth={1.5} />
          {!collapsed && <span>{t("common.settings")}</span>}
        </button>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-editorial-ink-muted transition-colors hover:bg-editorial-surface-soft"
          title={collapsed ? t("common.expandSidebar") : t("common.collapseSidebar")}
        >
          {collapsed ? (
            <ChevronRight size={16} strokeWidth={1.5} />
          ) : (
            <ChevronLeft size={16} strokeWidth={1.5} />
          )}
        </button>
      </div>
    </motion.aside>
  );
}
