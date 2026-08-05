"use client";

import { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Rss, Globe, ExternalLink, RefreshCw } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation, Trans } from "react-i18next";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MotionSpinner } from "@/components/ui/motion-spinner";
import { toast } from "@/components/ui/toast";
import { fadeSlideVariants, listContainerVariants, listItemVariants } from "@/lib/motion";

export const Route = createFileRoute("/feeds/")({
  component: FeedsIndexPage,
});

interface FeedItem {
  id: string;
  sourceId: string;
  title: string;
  description: string | null;
  link: string | null;
  guid: string;
  author: string | null;
  category: string | null;
  image: string | null;
  pubDate: string | null;
  fetchedAt: string;
  isRead: number;
  createdAt: string;
}

interface SourceInfo {
  id: string;
  type: "rss" | "social";
  platform: string | null;
  title: string;
}

function FeedsIndexPage() {
  const { t } = useTranslation();
  const [feeds, setFeeds] = useState<FeedItem[]>([]);
  const [sources, setSources] = useState<Map<string, SourceInfo>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [feedsRes, sourcesRes] = await Promise.all([
        fetch("/api/v1/feeds?limit=100"),
        fetch("/api/v1/rss-sources"),
      ]);

      const feedsJson = await feedsRes.json();
      const sourcesJson = await sourcesRes.json();

      setFeeds(
        Array.isArray(feedsJson?.data?.data)
          ? feedsJson.data.data
          : Array.isArray(feedsJson?.data)
            ? feedsJson.data
            : [],
      );
      const sourceData = Array.isArray(sourcesJson?.data)
        ? sourcesJson.data
        : Array.isArray(sourcesJson)
          ? sourcesJson
          : [];
      setSources(new Map(sourceData.map((s: SourceInfo) => [s.id, s])));
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSync = async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/v1/feeds/sync", { method: "POST" });
      const json = await res.json();
      const result = json?.data as { inserted?: number; failed?: number } | undefined;
      if (result) {
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
      }
      await load();
    } catch {
      toast.add({ title: t("feeds.syncError"), type: "error" });
    } finally {
      setRefreshing(false);
    }
  };

  const handleMarkRead = async (id: string) => {
    try {
      await fetch(`/api/v1/feeds/${id}/read`, { method: "POST" });
      setFeeds((prev) => prev.map((f) => (f.id === id ? { ...f, isRead: 1 } : f)));
    } catch {
      // ignore
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const diff = Date.now() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return t("time.justNow");
    if (minutes < 60) return t("time.minutesAgo", { n: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t("time.hoursAgo", { n: hours });
    return t("time.daysAgo", { n: Math.floor(hours / 24) });
  };

  const sourceFor = (feed: FeedItem): SourceInfo | undefined => sources.get(feed.sourceId);

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
    <div className="h-full overflow-y-auto p-6 max-sm:p-4">
      <div className="mx-auto max-w-[1080px]">
        <AnimatePresence mode="wait" initial={false}>
          {loading ? (
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
              <div className="mb-3 flex items-center justify-end">
                <Button
                  onClick={() => void handleSync()}
                  disabled={refreshing}
                  size="sm"
                  className="h-8 gap-1.5 rounded-lg px-3 text-[12px]"
                >
                  {refreshing ? <MotionSpinner size={14} /> : <RefreshCw size={14} />}
                  {refreshing ? t("feeds.syncing") : t("feeds.sync")}
                </Button>
              </div>

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
              ) : (
                <motion.div
                  className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3"
                  variants={listContainerVariants}
                  initial="initial"
                  animate="animate"
                >
                  {feeds.map((item) => {
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
                              {src?.type === "rss" ? <Rss size={10} /> : null}
                              {src?.title ?? t("feeds.unknownSource")}
                            </span>
                            <span className="ml-auto shrink-0 text-[11px] text-editorial-ink-muted">
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
