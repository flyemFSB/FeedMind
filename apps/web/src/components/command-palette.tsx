import { useEffect, useState, type ElementType } from "react";
import { Autocomplete } from "@base-ui/react/autocomplete";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  CalendarDays,
  Database,
  FileText,
  History,
  List,
  Network,
  RefreshCw,
  Rss,
  Search,
  Settings,
  Sparkles,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useAppShell } from "@/app/shell/app-shell-context";
import { useWikiSpaces, useWikiPages } from "@/lib/hooks/use-wiki";
import { useFeeds, useSyncFeeds } from "@/lib/hooks/use-feeds";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

/** 命令项：label/subtitle 参与过滤与展示，onSelect 为选中后的动作 */
interface PaletteItem {
  value: string;
  label: string;
  subtitle?: string;
  shortcut?: string;
  icon: ElementType;
  onSelect: () => void;
}

const GROUP_HEADING_CLASS = "px-1 py-1 text-[11px] font-semibold text-editorial-ink-muted";

const ITEM_CLASS = cn(
  "group flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs text-editorial-ink transition-colors",
  "data-[highlighted]:bg-editorial-accent/10 data-[highlighted]:text-editorial-accent",
);

/**
 * 全局指挥台：功能导航 / 快捷动作 / 概念与资讯直达。
 * 过滤与键盘导航交给 Base UI Autocomplete（inline 模式，列表就在弹窗里）。
 */
export function CommandPalette() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { commandPaletteOpen, closeCommandPalette, openAgentDrawer } = useAppShell();
  const [query, setQuery] = useState("");

  const { data: spaces = [] } = useWikiSpaces();
  const activeSpaceId = spaces[0]?.id;
  const { data: wikiData } = useWikiPages(activeSpaceId);
  const { data: feeds = [] } = useFeeds();
  const syncMutation = useSyncFeeds();

  // 每次打开清空输入框
  useEffect(() => {
    if (commandPaletteOpen) setQuery("");
  }, [commandPaletteOpen]);

  // 选中即关面板再执行：动作多为导航，先关掉避免遮罩残留到新页面
  const run = (action: () => void) => () => {
    closeCommandPalette();
    action();
  };

  const handleSync = async () => {
    try {
      const res = await syncMutation.mutateAsync();
      toast.add({
        title: t("feeds.syncDone", { inserted: res.inserted ?? 0 }),
        type: "success",
      });
    } catch {
      toast.add({
        title: t("feeds.syncFailed", "同步失败，请检查网络或配置"),
        type: "error",
      });
    }
  };

  const navItems: PaletteItem[] = [
    {
      value: "nav-feeds",
      label: "资讯动态",
      shortcut: "G F",
      icon: Rss,
      onSelect: () => void navigate({ to: "/feeds" }),
    },
    {
      value: "nav-sources",
      label: "订阅源管理",
      shortcut: "G S",
      icon: List,
      onSelect: () => void navigate({ to: "/sources" }),
    },
    {
      value: "nav-daily",
      label: "日报中心",
      shortcut: "G D",
      icon: CalendarDays,
      onSelect: () => void navigate({ to: "/daily-report" }),
    },
    {
      value: "nav-wiki",
      label: "知识库页面",
      shortcut: "G W",
      icon: FileText,
      onSelect: () => void navigate({ to: "/wiki", search: { view: "pages" } }),
    },
    {
      value: "nav-graph",
      label: "知识图谱",
      icon: Network,
      onSelect: () => void navigate({ to: "/wiki", search: { view: "graph" } }),
    },
    {
      value: "nav-materials",
      label: "知识材料",
      icon: Database,
      onSelect: () => void navigate({ to: "/wiki", search: { view: "sources" } }),
    },
    {
      value: "nav-settings",
      label: "配置中心",
      shortcut: "G C",
      icon: Settings,
      onSelect: () => void navigate({ to: "/settings" }),
    },
    {
      value: "nav-opslog",
      label: "运行日志",
      icon: History,
      onSelect: () => void navigate({ to: "/ops-log" }),
    },
  ];

  const actionItems: PaletteItem[] = [
    {
      value: "action-agent",
      label: "打开 AI 对话助手",
      shortcut: "⌘ \\",
      icon: Sparkles,
      onSelect: openAgentDrawer,
    },
    {
      value: "action-sync",
      label: "同步最新订阅资讯",
      icon: RefreshCw,
      onSelect: () => void handleSync(),
    },
  ];

  const pages = wikiData?.items ?? [];
  const pageItems: PaletteItem[] = pages.slice(0, 8).map((page) => ({
    value: `page-${page.concept_id}`,
    label: page.title,
    subtitle: page.path,
    icon: FileText,
    onSelect: () =>
      void navigate({
        to: "/wiki",
        search: { view: "pages", space: activeSpaceId, page: page.concept_id },
      }),
  }));

  // 资讯条目只在有查询词时出现，避免空查询把整个信息流倒进面板
  const feedItems: PaletteItem[] = query.trim()
    ? feeds.slice(0, 6).map((feed) => ({
        value: `feed-${feed.id}`,
        label: feed.title,
        ...(feed.author ? { subtitle: feed.author } : {}),
        icon: Rss,
        onSelect: () => void navigate({ to: "/feeds" }),
      }))
    : [];

  const groups = [
    { value: "快速导航", items: navItems },
    { value: "快捷动作", items: actionItems },
    ...(pageItems.length > 0 ? [{ value: "Wiki 知识库概念", items: pageItems }] : []),
    ...(feedItems.length > 0 ? [{ value: "资讯条目", items: feedItems }] : []),
  ];

  return (
    <Dialog open={commandPaletteOpen} onOpenChange={(open) => !open && closeCommandPalette()}>
      <DialogContent
        showCloseButton={false}
        className="max-w-xl gap-0 overflow-hidden rounded-xl border border-editorial-hairline bg-editorial-surface-card p-0 text-editorial-ink shadow-2xl"
      >
        <Autocomplete.Root
          items={groups}
          value={query}
          onValueChange={setQuery}
          // 过滤同时匹配标题与副标题（如概念的 path）
          itemToStringValue={(item: PaletteItem) => `${item.label} ${item.subtitle ?? ""}`}
          autoHighlight="always"
          inline
          open
        >
          <div className="flex items-center gap-2.5 border-b border-editorial-hairline-soft px-3.5 py-3">
            <Search size={16} className="shrink-0 text-editorial-ink-muted" />
            <Autocomplete.Input
              autoFocus
              placeholder={t("common.commandPlaceholder", "搜索功能、页面、概念或资讯...")}
              className="flex-1 bg-transparent text-sm text-editorial-ink outline-none placeholder:text-editorial-ink-muted"
            />
            <kbd className="hidden items-center rounded border border-editorial-hairline bg-editorial-surface-soft px-1.5 font-mono text-[10px] text-editorial-ink-muted sm:inline-flex">
              ESC
            </kbd>
          </div>

          <Autocomplete.List className="max-h-[380px] space-y-1 overflow-y-auto p-2 outline-none">
            <Autocomplete.Empty className="py-8 text-center text-xs text-editorial-ink-muted">
              {t("common.noResults", "未找到匹配项")}
            </Autocomplete.Empty>

            {groups.map((group) => (
              <Autocomplete.Group key={group.value} items={group.items} className="py-1.5">
                <Autocomplete.GroupLabel className={GROUP_HEADING_CLASS}>
                  {group.value}
                </Autocomplete.GroupLabel>
                {group.items.map((item) => (
                  <PaletteRow key={item.value} item={item} onSelect={run(item.onSelect)} />
                ))}
              </Autocomplete.Group>
            ))}
          </Autocomplete.List>

          <div className="flex items-center justify-between border-t border-editorial-hairline-soft bg-editorial-surface-soft px-3.5 py-2 text-tiny text-editorial-ink-muted">
            <span>使用方向键选择，回车进入</span>
            <span className="font-mono">⌘K 唤醒</span>
          </div>
        </Autocomplete.Root>
      </DialogContent>
    </Dialog>
  );
}

function PaletteRow({ item, onSelect }: { item: PaletteItem; onSelect: () => void }) {
  const Icon = item.icon;

  return (
    <Autocomplete.Item value={item} onClick={onSelect} className={ITEM_CLASS}>
      <Icon
        size={14}
        className="shrink-0 text-editorial-ink-muted group-data-[highlighted]:text-editorial-accent"
      />
      <span className="truncate font-medium">{item.label}</span>
      {item.subtitle && (
        <span className="max-w-[200px] truncate text-[11px] text-editorial-ink-muted">
          {item.subtitle}
        </span>
      )}
      {item.shortcut && (
        <kbd className="ml-auto inline-flex items-center rounded border border-editorial-hairline bg-editorial-surface-soft px-1.5 font-mono text-[10px] text-editorial-ink-muted">
          {item.shortcut}
        </kbd>
      )}
      <ArrowRight
        size={12}
        className="ml-auto hidden text-editorial-accent group-data-[highlighted]:block"
      />
    </Autocomplete.Item>
  );
}
