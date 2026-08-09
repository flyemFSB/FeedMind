"use client";

import { useNavigate, useRouterState, useSearch } from "@tanstack/react-router";
import type { WikiView } from "@/src/routes/wiki";
import {
  ClipboardCheck,
  Clock,
  FileText,
  List,
  Network,
  Rss,
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
  { id: "history", icon: Clock, label: "wiki.tabImportHistory", view: "history" },
  { id: "lint", icon: ClipboardCheck, label: "wiki.tabLint", view: "lint" },
] as const;

export function WikiSidebar({ onSettingsClick, onRemoteClick }: WikiSidebarProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // 全局侧边栏读取当前 URL 的 view（合并所有路由 search），仅 /wiki 定义该参数
  const search = useSearch({ strict: false });
  const currentView = search.view ?? "pages";
  const navigate = useNavigate();
  const isWikiActive = pathname.startsWith("/wiki");

  const goToView = (view: WikiView) => {
    void navigate({ to: "/wiki", search: { view }, replace: false });
  };

  return (
    <aside
      data-island="navigation"
      className="relative z-20 flex h-full w-[48px] shrink-0 flex-col items-center overflow-hidden bg-editorial-canvas-soft max-sm:w-[44px]"
    >
      <div className="flex w-full flex-col items-center pt-1.5">
        <motion.button
          type="button"
          onClick={() => goToView("pages")}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.92 }}
          className="flex h-10 w-10 items-center justify-center rounded-md text-editorial-ink hover:bg-editorial-surface-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
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

      <div className="my-1.5 h-[2px] w-7 rounded-sm bg-editorial-hairline" />

      <nav className="flex w-full flex-col items-center gap-1.5 px-1">
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

      <div className="my-1.5 h-[2px] w-7 rounded-sm bg-editorial-hairline" />

      <nav className="flex w-full flex-col items-center gap-1.5 px-1">
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

      <div className="my-1.5 h-[2px] w-7 rounded-sm bg-editorial-hairline" />

      <nav className="flex w-full flex-col items-center gap-1.5 px-1">
        <NavIconButton
          icon={Rss}
          label="feeds.title"
          active={pathname === "/feeds"}
          onClick={() => void navigate({ to: "/feeds" })}
        />
        <NavIconButton
          icon={List}
          label="feeds.sourceManagement"
          active={pathname === "/sources"}
          onClick={() => void navigate({ to: "/sources" })}
        />
      </nav>

      <nav className="mt-auto flex w-full flex-col items-center gap-1.5 px-1 pb-3">
        <NavIconButton icon={Smartphone} label="common.remoteConnection" onClick={onRemoteClick} />
        <div className="my-1.5 h-[2px] w-7 rounded-sm bg-editorial-hairline" />
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
      animate={{ scale: active ? 1.04 : 1 }}
      whileHover={{ scale: active ? 1.07 : 1.04 }}
      whileTap={{ scale: 0.92 }}
      className={cn(
        "relative flex h-10 w-10 items-center justify-center rounded-md",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent",
        active
          ? "bg-editorial-surface-strong text-editorial-ink"
          : "text-editorial-ink-soft hover:bg-editorial-surface-strong hover:text-editorial-ink",
      )}
      aria-label={labelText}
      title={labelText}
      aria-pressed={active}
      aria-current={active ? "page" : undefined}
    >
      <Icon size={18} strokeWidth={active ? 2 : 1.6} />
    </motion.button>
  );
}
