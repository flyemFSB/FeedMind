import { useNavigate, useRouterState, useSearch } from "@tanstack/react-router";
import type { WikiView } from "@/lib/wiki-search";
import {
  CalendarDays,
  Database,
  FileText,
  History,
  List,
  Network,
  Rss,
  Settings,
  Smartphone,
} from "lucide-react";
import { m } from "motion/react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { SimpleTooltip } from "@/components/ui/tooltip";

interface WikiSidebarProps {
  onRemoteClick: () => void;
}

const NAV_ITEMS = [
  { id: "pages", icon: FileText, label: "wiki.tabPages", view: "pages" },
  { id: "graph", icon: Network, label: "wiki.tabGraph", view: "graph" },
  { id: "sources", icon: Database, label: "wiki.tabSources", view: "sources" },
] as const;

export function WikiSidebar({ onRemoteClick }: WikiSidebarProps) {
  const { t } = useTranslation();
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
        <SimpleTooltip content="FeedMind" side="right" sideOffset={8}>
          <m.button
            type="button"
            onClick={() => goToView("pages")}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.92 }}
            className="flex h-10 w-10 items-center justify-center rounded-md text-editorial-ink hover:bg-editorial-surface-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            aria-label="FeedMind"
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
          </m.button>
        </SimpleTooltip>
      </div>

      <div className="my-1.5 h-[2px] w-7 rounded-sm bg-editorial-hairline" />

      <nav aria-label={t("wiki.title")} className="flex w-full flex-col items-center gap-1.5 px-1">
        {NAV_ITEMS.map((tool) => (
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

      <nav aria-label={t("feeds.title")} className="flex w-full flex-col items-center gap-1.5 px-1">
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
        <NavIconButton
          icon={CalendarDays}
          label="dailyReport.title"
          active={pathname === "/daily-report"}
          onClick={() => void navigate({ to: "/daily-report" })}
        />
      </nav>

      <div className="my-1.5 h-[2px] w-7 rounded-sm bg-editorial-hairline" />

      <nav
        aria-label={t("opsLog.title")}
        className="flex w-full flex-col items-center gap-1.5 px-1"
      >
        <NavIconButton
          icon={History}
          label="opsLog.title"
          active={pathname === "/ops-log"}
          onClick={() => void navigate({ to: "/ops-log" })}
        />
      </nav>

      <nav
        aria-label={t("common.settings")}
        className="mt-auto flex w-full flex-col items-center gap-1.5 px-1 pb-3"
      >
        <NavIconButton icon={Smartphone} label="common.remoteConnection" onClick={onRemoteClick} />
        <div className="my-1.5 h-[2px] w-7 rounded-sm bg-editorial-hairline" />
        <NavIconButton
          icon={Settings}
          label="common.settings"
          active={pathname.startsWith("/settings")}
          onClick={() => void navigate({ to: "/settings" })}
        />
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
    <SimpleTooltip content={labelText} side="right" sideOffset={8}>
      <m.button
        type="button"
        onClick={onClick}
        animate={{ scale: active ? 1.02 : 1 }}
        whileHover={{ scale: active ? 1.05 : 1.04 }}
        whileTap={{ scale: 0.94 }}
        className={cn(
          "group relative flex h-10 w-10 items-center justify-center rounded-md transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent",
          active
            ? "bg-editorial-surface-strong text-editorial-ink font-medium shadow-2xs"
            : "text-editorial-ink-soft hover:bg-editorial-surface-strong hover:text-editorial-ink",
        )}
        aria-label={labelText}
        aria-pressed={active}
        aria-current={active ? "page" : undefined}
      >
        {active && (
          <m.div
            layoutId="active-sidebar-indicator"
            className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-editorial-accent"
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
          />
        )}
        <Icon size={18} strokeWidth={active ? 2 : 1.6} />
      </m.button>
    </SimpleTooltip>
  );
}
