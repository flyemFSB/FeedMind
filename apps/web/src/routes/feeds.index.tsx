"use client";

import { useState, useMemo, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Rss,
  Globe,
  ExternalLink,
  RefreshCw,
  Search,
  X,
  Trash2,
  Check,
  SquareCheckBig,
  CalendarDays,
} from "lucide-react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation, Trans } from "react-i18next";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { MotionSpinner } from "@/components/ui/motion-spinner";
import { toast } from "@/components/ui/toast";
import { fadeSlideVariants } from "@/lib/motion";
import {
  Xiaohongshu,
  Douyin,
  Bilibili,
  Zhihu,
  Weread,
} from "@/components/icons/remote-connection-icons";
import {
  useFeeds,
  useRssSources,
  useSyncFeeds,
  useMarkFeedRead,
  useDeleteFeeds,
} from "@/lib/hooks/use-feeds";
import type { FeedItem, RssSource } from "@/lib/api/feeds";

// 字段显式含 undefined：validateSearch 用 undefined 表示"移除该参数"，
// exactOptionalPropertyTypes 下需在类型中声明 undefined 才能返回 { filter: undefined }
type FeedsIndexSearch = {
  filter?: string | undefined;
  keyword?: string | undefined;
};

export const Route = createFileRoute("/feeds/")({
  // 筛选与关键词放入 URL search params：可分享/刷新保留，官方推荐替代组件内 useState
  validateSearch: (search: Record<string, unknown>): FeedsIndexSearch => ({
    filter: typeof search["filter"] === "string" ? search["filter"] : undefined,
    keyword: typeof search["keyword"] === "string" ? search["keyword"] : undefined,
  }),
  component: FeedsIndexPage,
});
const FILTER_ICONS: Record<string, React.ElementType> = {
  rss: Rss,
  xiaohongshu: Xiaohongshu,
  weread: Weread,
  bilibili: Bilibili,
  zhihu: Zhihu,
  douyin: Douyin,
};

// 平台 id → i18n key（筛选条/卡片标识用中文名）
const PLATFORM_LABELS: Record<string, string> = {
  rss: "feeds.rss",
  bilibili: "feeds.platformBilibili",
  douyin: "feeds.platformDouyin",
  xiaohongshu: "feeds.platformXiaohongshu",
  zhihu: "feeds.platformZhihu",
  weread: "feeds.platformWeread",
};

// 卡片流网格参数：与旧版 grid auto-fill minmax(280px,1fr) 等价，虚拟化按此计算列数
const MIN_CARD_WIDTH = 280;
const CARD_GAP = 12;

// 卡片描述取纯文本前 300 字符（HTML 剥离）：描述在卡片内受 line-clamp 限制，这里控制数据量
function cleanDescription(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 300);
}

// 来源图标（卡片 badge / 筛选条共用）
const iconFor = (src: RssSource | undefined): React.ElementType | null => {
  if (!src) return null;
  return FILTER_ICONS[src.type === "social" ? (src.platform ?? "unknown") : "rss"] ?? null;
};

function FeedsIndexPage() {
  const { t, i18n } = useTranslation();
  const [refreshing, setRefreshing] = useState(false);
  // 选择模式：与浏览互斥，避免卡片点击在"打开链接/勾选"间语义打架
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteOpen, setDeleteOpen] = useState(false);
  // 顶部来源筛选与关键词查询存于 URL search params（可分享/刷新保留）
  const { filter = "all", keyword = "" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const setFilter = (value: string) => {
    // undefined 在 search 中表示删除该参数，保证切换到"全部"时 URL 不带 filter
    void navigate({
      search: (prev) => ({ ...prev, filter: value === "all" ? undefined : value }),
      replace: true,
    });
  };
  const setKeyword = (value: string) => {
    void navigate({
      search: (prev) => ({ ...prev, keyword: value || undefined }),
      replace: true,
    });
  };

  const { data: feeds = [], isLoading } = useFeeds();
  const { data: sourceList = [] } = useRssSources();
  const syncMutation = useSyncFeeds();
  const markReadMutation = useMarkFeedRead();
  const deleteMutation = useDeleteFeeds();
  const sources = useMemo(() => new Map(sourceList.map((s) => [s.id, s])), [sourceList]);

  const handleSync = async () => {
    setRefreshing(true);
    try {
      const result = await syncMutation.mutateAsync();
      if ((result.failed ?? 0) > 0) {
        toast.add({
          title: t("feeds.syncPartial", {
            inserted: result.inserted ?? 0,
            failed: result.failed,
          }),
          type: "warning",
        });
      } else {
        toast.add({
          title: t("feeds.syncDone", { inserted: result.inserted ?? 0 }),
          type: "success",
        });
      }
    } catch {
      // apiFetch 已 toast 错误，避免重复提示
    } finally {
      setRefreshing(false);
    }
  };

  const handleMarkRead = (id: string) => {
    // 已读标记由 useMarkFeedRead 内部乐观更新缓存
    markReadMutation.mutate(id);
  };

  // 时间显示：7 天内相对（刚刚/X分钟前/X小时前/X天前）便于感知时效，
  // 超过一周切本地化具体日期（本年不带年、跨年带年，同 X/GitHub/Material 惯例）
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const diff = Date.now() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return t("time.justNow");
    if (minutes < 60) return t("time.minutesAgo", { n: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t("time.hoursAgo", { n: hours });
    const days = Math.floor(hours / 24);
    if (days < 7) return t("time.daysAgo", { n: days });
    const sameYear = date.getFullYear() === new Date().getFullYear();
    return new Intl.DateTimeFormat(i18n.language, {
      month: "long",
      day: "numeric",
      ...(sameYear ? {} : { year: "numeric" }),
    }).format(date);
  };

  const sourceFor = (feed: FeedItem): RssSource | undefined => sources.get(feed.sourceId);

  // 筛选条：全部 + 有数据的来源，各带条目计数。
  // rss 源按单个来源展开（key `src:${id}`，label 用源标题），social 仍按平台聚合——
  // 否则所有 rss 源挤在一个"RSS"项下，沉底条目多的源（如 Changelog）无法单独查看
  const filterItems = useMemo(() => {
    const counts = new Map<
      string,
      { count: number; label: string; Icon: React.ElementType | null }
    >();
    for (const f of feeds) {
      const src = sources.get(f.sourceId);
      if (!src) continue;
      const isSocial = src.type === "social";
      const key = isSocial ? (src.platform ?? "unknown") : `src:${src.id}`;
      const label = isSocial
        ? t(PLATFORM_LABELS[key] ?? "feeds.unknownSource")
        : src.title || t("feeds.unknownSource");
      const Icon = isSocial ? (FILTER_ICONS[key] ?? Globe) : Rss;
      const cur = counts.get(key);
      counts.set(key, {
        count: (cur?.count ?? 0) + 1,
        label: cur?.label ?? label,
        Icon: cur?.Icon ?? Icon,
      });
    }
    // 固定顺序展示 social 平台，rss 源按来源名排序
    const socialOrder = ["xiaohongshu", "weread", "bilibili", "zhihu", "douyin"];
    const socialItems = socialOrder
      .filter((k) => counts.has(k))
      .map((k) => ({ key: k, ...counts.get(k)! }));
    const rssItems = [...counts.entries()]
      .filter(([k]) => k.startsWith("src:"))
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => a.label.localeCompare(b.label, "zh"));
    return [
      { key: "all", count: feeds.length, label: t("feeds.all"), Icon: Globe },
      ...socialItems,
      ...rssItems,
    ];
  }, [feeds, sources, t]);

  const filteredFeeds = useMemo(() => {
    if (filter === "all") return feeds;
    return feeds.filter((f) => {
      const src = sources.get(f.sourceId);
      if (!src) return false;
      const key = src.type === "social" ? (src.platform ?? "unknown") : `src:${src.id}`;
      return key === filter;
    });
  }, [feeds, filter, sources]);

  const searchedFeeds = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return filteredFeeds;
    return filteredFeeds.filter((f) =>
      [f.title, f.description, f.author].filter(Boolean).some((v) => v!.toLowerCase().includes(kw)),
    );
  }, [filteredFeeds, keyword]);

  // ─── 虚拟化（行级：多列卡片流按行分组虚拟，行高由 measureElement 动态测量） ───
  // 滚动容器：最外层 div 即滚动元素，用 state 管理（挂载时触发重渲染，修复首次挂载空白，同 wiki-page-list 先例）
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  // 列数随容器宽度响应：与旧版 grid auto-fill minmax(280px,1fr) 等价。
  // 容器元素用 state 管理：内容分支在数据加载后才挂载，若用 useEffect([])+ref，
  // 首次挂载时拿到的是 null，RO 永不注册 → 宽度恒 0 → 列数恒 1（一条占一宽行）
  const [gridEl, setGridEl] = useState<HTMLDivElement | null>(null);
  const [gridWidth, setGridWidth] = useState(0);
  useEffect(() => {
    if (!gridEl) return;
    const ro = new ResizeObserver((entries) => {
      setGridWidth(entries[0]?.contentRect.width ?? 0);
    });
    ro.observe(gridEl);
    return () => ro.disconnect();
  }, [gridEl]);
  const cols = Math.max(1, Math.floor((gridWidth + CARD_GAP) / (MIN_CARD_WIDTH + CARD_GAP)));

  // 行分组：按列数切块，虚拟化粒度是行（行数 = ceil(条目/列数)，千条量级也仅百余行）
  const rows = useMemo(() => {
    const result: FeedItem[][] = [];
    for (let i = 0; i < searchedFeeds.length; i += cols) {
      result.push(searchedFeeds.slice(i, i + cols));
    }
    return result;
  }, [searchedFeeds, cols]);

  // 行高估算取含图卡片的中间值，measureElement 实测修正（图片位固定 aspect，加载前后行高稳定）
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollEl,
    estimateSize: () => 260,
    overscan: 4,
    // 行 key 用行首条目 id：筛选/搜索变化时尽量复用已测量行高
    getItemKey: (index) => rows[index]?.[0]?.id ?? index,
  });

  // ─── 选择模式 ────────────────────────────────────────────────
  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelected(new Set());
  };

  // 全选作用于当前可见列表（受筛选/搜索影响），半选态据此判定
  const visibleIds = searchedFeeds.map((f) => f.id);
  const selectedVisibleCount = visibleIds.filter((id) => selected.has(id)).length;
  const allVisibleSelected = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
  const someVisibleSelected = selectedVisibleCount > 0 && selectedVisibleCount < visibleIds.length;

  const toggleSelectAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of visibleIds) {
        if (allVisibleSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  };

  const handleDeleteSelected = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    try {
      await deleteMutation.mutateAsync(ids);
      setDeleteOpen(false);
      toast.add({
        title: t("feeds.deleteSelectedSuccess", { count: ids.length }),
        type: "success",
      });
      exitSelectMode();
    } catch {
      // apiFetch 已 toast 错误；缓存回滚由 useDeleteFeeds 处理
    }
  };

  const categoriesFor = (item: FeedItem): string[] => {
    if (!item.category) return [];
    try {
      const parsed = JSON.parse(item.category);
      return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === "string") : [];
    } catch {
      return [];
    }
  };

  return (
    <div ref={setScrollEl} className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1080px] px-6 pb-6 max-sm:px-4">
        {/* 来源筛选条 + 关键词查询：吸顶 + 半透明毛玻璃，仅在内容就绪后显示 */}
        {!isLoading && (
          <div className="sticky top-0 z-10 mb-3 space-y-2 bg-background/90 py-2 backdrop-blur-sm">
            <AnimatePresence mode="wait" initial={false}>
              {selectMode ? (
                <motion.div
                  key="select"
                  variants={fadeSlideVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                >
                  <div className="flex items-center gap-2.5">
                    <Checkbox
                      checked={allVisibleSelected}
                      indeterminate={someVisibleSelected}
                      onCheckedChange={() => toggleSelectAllVisible()}
                      aria-label={t("feeds.selectAll")}
                      className="cursor-pointer"
                    />
                    <span className="text-body font-medium text-editorial-ink tabular-nums">
                      {t("feeds.selectedCount", { count: selected.size })}
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                      <Button
                        onClick={exitSelectMode}
                        size="sm"
                        variant="ghost"
                        className="h-8 shrink-0 gap-1.5 rounded-lg px-3 text-xs"
                      >
                        <X size={14} />
                        {t("feeds.exitSelect")}
                      </Button>
                      <Button
                        onClick={() => setDeleteOpen(true)}
                        disabled={selected.size === 0}
                        size="sm"
                        className="h-8 shrink-0 gap-1.5 rounded-lg bg-destructive-strong px-3 text-xs text-destructive-foreground hover:brightness-[0.93]"
                      >
                        <Trash2 size={14} />
                        {t("feeds.deleteSelected")}
                        <span className="tabular-nums">({selected.size})</span>
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="normal"
                  variants={fadeSlideVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                >
                  <div className="flex items-center gap-2">
                    <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
                      {filterItems.map(({ key, count, label, Icon }) => {
                        const active = filter === key;
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setFilter(key)}
                            aria-pressed={active}
                            className={cn(
                              "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                              active
                                ? "border-editorial-accent bg-editorial-accent/10 font-semibold text-editorial-accent"
                                : "border-editorial-hairline-strong font-medium text-editorial-ink-muted hover:border-editorial-hairline hover:text-editorial-ink",
                            )}
                          >
                            <Icon size={12} />
                            {label}
                            <span
                              className={cn(
                                "rounded-full px-1.5 text-tiny tabular-nums",
                                active
                                  ? "bg-editorial-accent/15 font-semibold text-editorial-accent"
                                  : "bg-editorial-surface-strong font-medium text-editorial-ink-muted",
                              )}
                            >
                              {count}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <Button
                      onClick={() => setSelectMode(true)}
                      disabled={feeds.length === 0}
                      size="sm"
                      variant="ghost"
                      className="h-8 shrink-0 gap-1.5 rounded-lg px-3 text-xs"
                    >
                      <SquareCheckBig size={14} />
                      {t("feeds.select")}
                    </Button>
                    <Button
                      onClick={() => void handleSync()}
                      disabled={refreshing}
                      size="sm"
                      className="h-8 shrink-0 gap-1.5 rounded-lg px-3 text-xs"
                    >
                      {refreshing ? <MotionSpinner size={14} /> : <RefreshCw size={14} />}
                      {refreshing ? t("feeds.syncing") : t("feeds.sync")}
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            {/* 搜索框常驻：选择模式可先搜索再批量选择，输入焦点不因模式切换丢失 */}
            <div className="relative">
              <Search
                size={14}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-editorial-ink-muted"
              />
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder={t("feeds.searchPlaceholder")}
                className="w-full rounded-lg border border-editorial-hairline-strong bg-editorial-surface-card py-2 pl-8 pr-8 text-body text-editorial-ink outline-none focus:border-editorial-accent focus:ring-2 focus:ring-editorial-accent-soft placeholder:text-editorial-ink-muted"
              />
              {keyword && (
                <button
                  type="button"
                  onClick={() => setKeyword("")}
                  aria-label={t("feeds.clearSearch")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-editorial-ink-muted transition-colors hover:text-editorial-ink"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            {/* 底部渐隐：滚动内容从筛选条下方穿过时柔和淡入，避免硬边截断 */}
            <div className="pointer-events-none absolute inset-x-0 -bottom-4 h-4 bg-linear-to-b from-background/90 to-transparent" />
          </div>
        )}
        <AnimatePresence mode="wait" initial={false}>
          {isLoading ? (
            <motion.div
              key="loading"
              variants={fadeSlideVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <div className="mb-3 flex items-center justify-end">
                <Skeleton className="ml-auto h-8 w-24 rounded-lg" />
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div
                    key={index}
                    className="overflow-hidden rounded-lg border border-editorial-hairline bg-editorial-surface-card"
                  >
                    <Skeleton className="aspect-[16/9] w-full rounded-none" />
                    <div className="space-y-2.5 p-4">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-2/3" />
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="content"
              variants={fadeSlideVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              {feeds.length === 0 ? (
                <div className="flex flex-col items-center rounded-lg border border-dashed border-editorial-hairline-strong bg-editorial-surface-card px-4 py-16 text-center">
                  <Globe size={24} className="mb-3 text-editorial-ink-muted" />
                  <p className="text-body text-editorial-ink-muted">
                    <Trans i18nKey="feeds.empty">
                      暂无内容，前往{" "}
                      <a href="/sources" className="text-editorial-primary underline">
                        订阅管理
                      </a>{" "}
                      添加订阅后点击同步
                    </Trans>
                  </p>
                </div>
              ) : filteredFeeds.length === 0 ? (
                <div className="flex flex-col items-center rounded-lg border border-dashed border-editorial-hairline-strong bg-editorial-surface-card px-4 py-12 text-center">
                  <Globe size={22} className="mb-2 text-editorial-ink-muted" />
                  <p className="text-body text-editorial-ink-muted">{t("feeds.filterEmpty")}</p>
                </div>
              ) : searchedFeeds.length === 0 ? (
                <div className="flex flex-col items-center rounded-lg border border-dashed border-editorial-hairline-strong bg-editorial-surface-card px-4 py-12 text-center">
                  <Search size={22} className="mb-2 text-editorial-ink-muted" />
                  <p className="text-body text-editorial-ink-muted">{t("feeds.searchEmpty")}</p>
                </div>
              ) : (
                <div
                  ref={setGridEl}
                  className="relative"
                  style={{ height: rowVirtualizer.getTotalSize() }}
                >
                  {/* 宽度测量前（gridWidth=0）不渲染行：避免 cols=1 的"一条占一宽行"闪烁 */}
                  {gridWidth > 0 &&
                    rowVirtualizer.getVirtualItems().map((row) => (
                      <div
                        key={row.key}
                        ref={rowVirtualizer.measureElement}
                        data-index={row.index}
                        className="absolute inset-x-0 pb-3"
                        style={{ transform: `translateY(${row.start}px)` }}
                      >
                        <div
                          className="grid gap-3"
                          style={{
                            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                          }}
                        >
                          {rows[row.index]!.map((item) => (
                            <FeedCard
                              key={item.id}
                              item={item}
                              src={sourceFor(item)}
                              cats={categoriesFor(item)}
                              selectMode={selectMode}
                              selected={selected.has(item.id)}
                              onToggleSelect={toggleSelect}
                              onMarkRead={handleMarkRead}
                              formatTime={formatTime}
                              lang={i18n.language}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <DeleteConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => void handleDeleteSelected()}
        title={t("feeds.deleteSelectedTitle")}
        description={t("feeds.deleteSelectedConfirm", { count: selected.size })}
        confirming={deleteMutation.isPending}
      />
    </div>
  );
}

// 单张卡片。虚拟化下行按需挂载/卸载，故不做进入/布局动画（官方最佳实践），
// 仅保留 whileTap 手势反馈与图片淡入
function FeedCard({
  item,
  src,
  cats,
  selectMode,
  selected,
  onToggleSelect,
  onMarkRead,
  formatTime,
  lang,
}: {
  item: FeedItem;
  src: RssSource | undefined;
  cats: string[];
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onMarkRead: (id: string) => void;
  formatTime: (dateStr: string) => string;
  lang: string;
}) {
  const { t } = useTranslation();
  const BadgeIcon = iconFor(src);

  return (
    <motion.a
      whileTap={{ scale: 0.99 }}
      href={item.link ?? undefined}
      target={item.link ? "_blank" : undefined}
      rel={item.link ? "noopener noreferrer" : undefined}
      onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
        if (selectMode) {
          e.preventDefault();
          onToggleSelect(item.id);
          return;
        }
        if (!item.isRead) void onMarkRead(item.id);
      }}
      // 空格在 <a> 上默认滚动而不触发点击，选择模式下手动拦截；回车走 onClick 已能切换
      onKeyDown={(e: React.KeyboardEvent<HTMLAnchorElement>) => {
        if (selectMode && e.key === " ") {
          e.preventDefault();
          onToggleSelect(item.id);
        }
      }}
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-lg border bg-editorial-surface-card",
        selectMode
          ? selected
            ? "cursor-pointer border-editorial-accent bg-editorial-accent/[0.04] ring-1 ring-editorial-accent"
            : "cursor-pointer border-editorial-hairline"
          : "border-editorial-hairline",
        "hover:border-editorial-hairline-strong hover:bg-editorial-surface-soft",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent focus-visible:ring-offset-1",
      )}
    >
      {selectMode && (
        <span
          aria-hidden="true"
          className={cn(
            "absolute left-2.5 top-2.5 z-10 flex h-[22px] w-[22px] items-center justify-center rounded-md border transition-colors",
            selected
              ? "border-editorial-accent bg-editorial-accent text-editorial-ink-on-primary"
              : "border-white/70 bg-black/25 text-white/80 backdrop-blur-sm",
          )}
        >
          <Check size={13} strokeWidth={3} />
        </span>
      )}
      {item.image && (
        <div className="aspect-[16/9] w-full overflow-hidden bg-editorial-surface-soft">
          <motion.img
            src={item.image}
            alt=""
            loading="lazy"
            onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
              // 图片加载失败时收起整个图位，避免留出空灰块
              e.currentTarget.parentElement?.style.setProperty("display", "none");
            }}
            className="h-full w-full object-cover"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.24 }}
          />
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col p-4">
        <div className="mb-2.5 flex items-center gap-1.5">
          {!item.isRead && (
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-editorial-primary"
            />
          )}
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-tiny font-medium",
              src?.type === "social"
                ? "bg-editorial-accent-soft text-editorial-accent"
                : "bg-editorial-surface-strong text-editorial-ink-soft",
            )}
          >
            {BadgeIcon ? <BadgeIcon size={10} /> : null}
            {src?.title ?? (src?.type === "rss" ? t("feeds.rss") : t("feeds.unknownSource"))}
          </span>
          <span
            title={new Intl.DateTimeFormat(lang, {
              dateStyle: "full",
              timeStyle: "short",
            }).format(new Date(item.pubDate ?? item.fetchedAt))}
            className="ml-auto shrink-0 text-tiny text-editorial-ink-muted"
          >
            {formatTime(item.pubDate ?? item.fetchedAt)}
          </span>
        </div>

        <h3
          className={cn(
            "line-clamp-2 text-sm leading-snug",
            item.isRead
              ? "font-normal text-editorial-ink-soft"
              : "font-semibold text-editorial-ink",
          )}
        >
          {item.title}
        </h3>

        {item.description && (
          <p className="mt-1.5 line-clamp-2 flex-1 text-xs leading-relaxed text-editorial-ink-soft">
            {cleanDescription(item.description)}
          </p>
        )}

        {cats.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {cats.slice(0, 2).map((c) => (
              <span
                key={c}
                className="rounded bg-editorial-surface-strong px-1.5 py-0.5 text-tiny text-editorial-ink-muted"
              >
                {c}
              </span>
            ))}
          </div>
        )}

        <div className="mt-auto flex items-center gap-2 border-t border-editorial-hairline-soft pt-2.5">
          {/* RSS 资讯发布日期（左下角）：可见的具体日期，区别于 badge 行的相对时间 */}
          <span className="flex shrink-0 items-center gap-1 text-tiny tabular-nums text-editorial-ink-muted">
            <CalendarDays size={11} className="shrink-0" />
            {new Intl.DateTimeFormat(lang, {
              year: "numeric",
              month: "short",
              day: "numeric",
            }).format(new Date(item.pubDate ?? item.fetchedAt))}
          </span>
          {item.author ? (
            <span className="truncate text-tiny text-editorial-ink-muted">{item.author}</span>
          ) : null}
          <ExternalLink
            size={12}
            className="ml-auto shrink-0 text-editorial-ink-muted transition-colors group-hover:text-editorial-primary"
          />
        </div>
      </div>
    </motion.a>
  );
}
