"use client";

import { useState, useMemo } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Rss, Globe, ExternalLink, RefreshCw, Search, X } from "lucide-react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation, Trans } from "react-i18next";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MotionSpinner } from "@/components/ui/motion-spinner";
import { toast } from "@/components/ui/toast";
import { fadeSlideVariants, listContainerVariants, listItemVariants } from "@/lib/motion";
import {
  Xiaohongshu,
  Douyin,
  Bilibili,
  Zhihu,
  Weread,
} from "@/components/icons/remote-connection-icons";
import { useFeeds, useRssSources, useSyncFeeds, useMarkFeedRead } from "@/lib/hooks/use-feeds";
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

function FeedsIndexPage() {
  const { t, i18n } = useTranslation();
  const [refreshing, setRefreshing] = useState(false);
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

  // 来源图标（卡片 badge / 筛选条共用）
  const iconFor = (src: RssSource | undefined): React.ElementType | null => {
    if (!src) return null;
    return FILTER_ICONS[src.type === "social" ? (src.platform ?? "unknown") : "rss"] ?? null;
  };

  // 筛选条：全部 + 有数据的来源，各带条目计数
  const filterItems = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of feeds) {
      const src = sources.get(f.sourceId);
      const key = src ? (src.type === "social" ? (src.platform ?? "unknown") : "rss") : null;
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    // 固定顺序展示，无数据的来源不出现
    const order = ["rss", "xiaohongshu", "weread", "bilibili", "zhihu", "douyin"];
    return [
      { key: "all", count: feeds.length },
      ...order.filter((k) => counts.has(k)).map((k) => ({ key: k, count: counts.get(k) ?? 0 })),
    ];
  }, [feeds, sources]);

  const filteredFeeds = useMemo(() => {
    if (filter === "all") return feeds;
    return feeds.filter((f) => {
      const src = sources.get(f.sourceId);
      const key = src ? (src.type === "social" ? (src.platform ?? "unknown") : "rss") : null;
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

  const categoriesFor = (item: FeedItem): string[] => {
    if (!item.category) return [];
    try {
      const parsed = JSON.parse(item.category);
      return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === "string") : [];
    } catch {
      return [];
    }
  };

  const cleanDescription = (html: string) =>
    html
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 300);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1080px] px-6 pb-6 max-sm:px-4">
        {/* 来源筛选条 + 关键词查询：吸顶 + 半透明毛玻璃，仅在内容就绪后显示 */}
        {!isLoading && (
          <div className="sticky top-0 z-10 mb-3 space-y-2 bg-background/90 py-2 backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
                {filterItems.map(({ key, count }) => {
                  const active = filter === key;
                  const Icon = FILTER_ICONS[key] ?? Globe;
                  const label =
                    key === "all"
                      ? t("feeds.all")
                      : t(PLATFORM_LABELS[key] ?? "feeds.unknownSource");
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setFilter(key)}
                      aria-pressed={active}
                      className={cn(
                        "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] transition-colors",
                        active
                          ? "border-editorial-accent bg-editorial-accent/10 font-semibold text-editorial-accent"
                          : "border-editorial-hairline-strong font-medium text-editorial-ink-muted hover:border-editorial-hairline hover:text-editorial-ink",
                      )}
                    >
                      <Icon size={12} />
                      {label}
                      <span
                        className={cn(
                          "rounded-full px-1.5 text-[11px] tabular-nums",
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
                onClick={() => void handleSync()}
                disabled={refreshing}
                size="sm"
                className="h-8 shrink-0 gap-1.5 rounded-lg px-3 text-[12px]"
              >
                {refreshing ? <MotionSpinner size={14} /> : <RefreshCw size={14} />}
                {refreshing ? t("feeds.syncing") : t("feeds.sync")}
              </Button>
            </div>
            <div className="relative">
              <Search
                size={14}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-editorial-ink-muted"
              />
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder={t("feeds.searchPlaceholder")}
                className="w-full rounded-lg border border-editorial-hairline-strong bg-editorial-surface-card py-2 pl-8 pr-8 text-[13px] text-editorial-ink outline-none focus:border-editorial-accent focus:ring-2 focus:ring-editorial-accent-soft placeholder:text-editorial-ink-muted"
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
                  <p className="text-[13px] text-editorial-ink-muted">
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
                  <p className="text-[13px] text-editorial-ink-muted">{t("feeds.filterEmpty")}</p>
                </div>
              ) : searchedFeeds.length === 0 ? (
                <div className="flex flex-col items-center rounded-lg border border-dashed border-editorial-hairline-strong bg-editorial-surface-card px-4 py-12 text-center">
                  <Search size={22} className="mb-2 text-editorial-ink-muted" />
                  <p className="text-[13px] text-editorial-ink-muted">{t("feeds.searchEmpty")}</p>
                </div>
              ) : (
                <motion.div
                  className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3"
                  variants={listContainerVariants}
                  initial="initial"
                  animate="animate"
                >
                  {searchedFeeds.map((item) => {
                    const src = sourceFor(item);
                    const cats = categoriesFor(item);
                    return (
                      <motion.a
                        key={item.id}
                        layout
                        variants={listItemVariants}
                        whileTap={{ scale: 0.99 }}
                        href={item.link ?? undefined}
                        target={item.link ? "_blank" : undefined}
                        rel={item.link ? "noopener noreferrer" : undefined}
                        onClick={() => {
                          if (!item.isRead) void handleMarkRead(item.id);
                        }}
                        className={cn(
                          "group flex flex-col overflow-hidden rounded-lg border border-editorial-hairline bg-editorial-surface-card",
                          "hover:border-editorial-hairline-strong hover:bg-editorial-surface-soft",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent focus-visible:ring-offset-1",
                        )}
                      >
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
                                "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium",
                                src?.type === "social"
                                  ? "bg-editorial-accent-soft text-editorial-accent"
                                  : "bg-editorial-surface-strong text-editorial-ink-soft",
                              )}
                            >
                              {(() => {
                                const Icon = iconFor(src);
                                return Icon ? <Icon size={10} /> : null;
                              })()}
                              {src?.title ??
                                (src?.type === "rss" ? t("feeds.rss") : t("feeds.unknownSource"))}
                            </span>
                            <span
                              title={new Intl.DateTimeFormat(i18n.language, {
                                dateStyle: "full",
                                timeStyle: "short",
                              }).format(new Date(item.pubDate ?? item.fetchedAt))}
                              className="ml-auto shrink-0 text-[11px] text-editorial-ink-muted"
                            >
                              {formatTime(item.pubDate ?? item.fetchedAt)}
                            </span>
                          </div>

                          <h3
                            className={cn(
                              "line-clamp-2 text-[14px] leading-snug",
                              item.isRead
                                ? "font-normal text-editorial-ink-soft"
                                : "font-semibold text-editorial-ink",
                            )}
                          >
                            {item.title}
                          </h3>

                          {item.description && (
                            <p className="mt-1.5 line-clamp-2 flex-1 text-[12px] leading-relaxed text-editorial-ink-soft">
                              {cleanDescription(item.description)}
                            </p>
                          )}

                          {cats.length > 0 && (
                            <div className="mt-2.5 flex flex-wrap gap-1.5">
                              {cats.slice(0, 2).map((c) => (
                                <span
                                  key={c}
                                  className="rounded bg-editorial-surface-strong px-1.5 py-0.5 text-[11px] text-editorial-ink-muted"
                                >
                                  {c}
                                </span>
                              ))}
                            </div>
                          )}

                          <div className="mt-auto flex items-center justify-between border-t border-editorial-hairline-soft pt-2.5">
                            {item.author ? (
                              <span className="truncate text-[11px] text-editorial-ink-muted">
                                {item.author}
                              </span>
                            ) : (
                              <span />
                            )}
                            <ExternalLink
                              size={12}
                              className="shrink-0 text-editorial-ink-muted transition-colors group-hover:text-editorial-primary"
                            />
                          </div>
                        </div>
                      </motion.a>
                    );
                  })}
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
