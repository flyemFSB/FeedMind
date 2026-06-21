"use client";

import { useNavigate, useRouterState, useSearch } from "@tanstack/react-router";
import {
  ClipboardCheck,
  Clock,
  Database,
  FileText,
  Network,
  Settings,
  Smartphone,
} from "lucide-react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface WikiSidebarProps {
  onSettingsClick: () => void;
  onRemoteClick: () => void;
}

const NAV_ITEMS = [
  { id: "pages", icon: FileText, label: "wiki.tabPages", view: "pages" },
  { id: "graph", icon: Network, label: "wiki.tabGraph", view: "graph" },
  { id: "sources", icon: Database, label: "wiki.tabSources", view: "sources" },
  { id: "history", icon: Clock, label: "wiki.tabImportHistory", view: "history" },
  { id: "lint", icon: ClipboardCheck, label: "wiki.tabLint", view: "lint" },
] as const;

/**
 * WikiSidebar — 左侧图标导航栏（Wiki 作为产品重心）
 * - 60px 宽，仅图标，无文字标签
 * - Logo 独立展示，与工具按钮隔开
 * - 激活态使用 surface-strong 背景，而非黑色填充
 * - 通过 URL ?view= 切换 Wiki 子视图，状态可分享、可前进后退
 */
export function WikiSidebar({ onSettingsClick, onRemoteClick }: WikiSidebarProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useSearch({ strict: false }) as { view?: string };
  const currentView = search.view ?? "pages";
  const navigate = useNavigate();
  const isWikiActive = pathname.startsWith("/wiki");

  const goToView = (view: string) => {
    navigate({ to: "/wiki", search: { view } as any, replace: false });
  };

  return (
    <aside className="relative z-20 flex h-full w-[60px] shrink-0 flex-col items-center border-r border-editorial-hairline bg-editorial-canvas-soft">
      {/* Logo — 独立区域，视觉上与工具按钮分开 */}
      <div className="flex w-full flex-col items-center pt-2 pb-2">
        <motion.button
          type="button"
          onClick={() => goToView("pages")}
          whileTap={{ scale: 0.94 }}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-editorial-surface-card text-editorial-ink shadow-sm ring-1 ring-editorial-hairline transition-colors hover:bg-editorial-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editorial-hairline-strong"
          aria-label="FeedMind"
          title="FeedMind"
        >
          <img
            src="/FeedMind-logo.svg"
            alt="FeedMind"
            width={24}
            height={24}
            className="h-6 w-6"
            loading="eager"
            decoding="async"
          />
        </motion.button>
      </div>

      {/* 分隔线 — 明确区分 Logo 与工具 */}
      <div className="mx-3 h-px w-6 bg-editorial-hairline" />

      {/* 导航工具 */}
      <nav className="flex w-full flex-col items-center gap-1.5 px-2 pt-3">
        {NAV_ITEMS.slice(0, 3).map((tool) => (
          <NavIconButton
            key={tool.id}
            icon={tool.icon}
            label={tool.label}
            active={isWikiActive && currentView === tool.view}
            onClick={() => goToView(tool.view)}
          />
        ))}
      </nav>

      <div className="mx-3 my-1.5 h-px w-6 bg-editorial-hairline" />

      <nav className="flex w-full flex-col items-center gap-1.5 px-2">
        {NAV_ITEMS.slice(3).map((tool) => (
          <NavIconButton
            key={tool.id}
            icon={tool.icon}
            label={tool.label}
            active={isWikiActive && currentView === tool.view}
            onClick={() => goToView(tool.view)}
          />
        ))}
      </nav>

      {/* 底部：远程连接 + 设置 */}
      <nav className="mt-auto flex w-full flex-col items-center gap-1.5 px-2 pb-3 pt-2">
        <NavIconButton icon={Smartphone} label="common.remoteConnection" onClick={onRemoteClick} />
        <div className="h-px w-5 bg-editorial-hairline" />
        <NavIconButton icon={Settings} label="common.settings" onClick={onSettingsClick} />
      </nav>
    </aside>
  );
}

interface NavIconButtonProps {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  onClick: () => void;
}

function NavIconButton({ icon: Icon, label, active, onClick }: NavIconButtonProps) {
  const { t } = useTranslation();
  const labelText = t(label);
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.9 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className={cn(
        "relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors duration-150 ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editorial-hairline-strong focus-visible:ring-offset-1 focus-visible:ring-offset-editorial-canvas-soft",
        active
          ? "bg-editorial-surface-strong text-editorial-ink"
          : "text-editorial-ink-muted hover:bg-editorial-surface-strong hover:text-editorial-ink",
      )}
      aria-label={labelText}
      title={labelText}
      aria-pressed={active}
    >
      <Icon size={18} strokeWidth={active ? 2 : 1.6} />
      {active && (
        <motion.span
          layoutId="wiki-nav-indicator"
          className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-editorial-ink"
          transition={{ type: "spring", stiffness: 500, damping: 35 }}
        />
      )}
    </motion.button>
  );
}
