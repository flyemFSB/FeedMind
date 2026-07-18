"use client";

import { useState, useEffect, useCallback } from "react";
import { Rss, Globe, ExternalLink, RefreshCw } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation, Trans } from "react-i18next";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/feeds/")({
  component: FeedsIndexPage,
});

interface FeedItem {
  id: string;
  source_id: string;
  title: string;
  description: string | null;
  link: string | null;
  guid: string;
  author: string | null;
  category: string | null;
  image: string | null;
  pub_date: string | null;
  fetched_at: string;
  is_read: number;
  created_at: string;
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
        Array.isArray(feedsJson?.data) ? feedsJson.data : Array.isArray(feedsJson) ? feedsJson : [],
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
    load();
  }, [load]);

  const handleSync = async () => {
    setRefreshing(true);
    try {
      await fetch("/api/v1/feeds/sync", { method: "POST" });
      await load();
    } catch {
      // ignore
    } finally {
      setRefreshing(false);
    }
  };

  const handleMarkRead = async (id: string) => {
    try {
      await fetch(`/api/v1/feeds/${id}/read`, { method: "POST" });
      setFeeds((prev) => prev.map((f) => (f.id === id ? { ...f, is_read: 1 } : f)));
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

  const sourceFor = (feed: FeedItem): SourceInfo | undefined => sources.get(feed.source_id);

  return (
    <div className="h-full overflow-y-auto p-6 max-sm:p-4">
      <div className="mx-auto max-w-[900px]">
        {loading ? (
          <div className="motion-content space-y-3">
            <Skeleton className="ml-auto h-8 w-24" />
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="space-y-2 border-b border-editorial-hairline py-4">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-full" />
              </div>
            ))}
          </div>
        ) : (
          <div className="motion-content">
            <div className="mb-3 flex items-center justify-end">
              <Button
                onClick={handleSync}
                disabled={refreshing}
                size="sm"
                className="h-8 gap-1.5 rounded-lg px-3 text-[12px]"
              >
                <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
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
              <div className="divide-y divide-editorial-hairline border-y border-editorial-hairline">
                {feeds.map((item) => {
                  const src = sourceFor(item);
                  return (
                    <article
                      key={item.id}
                      className={cn(
                        "group cursor-pointer px-1 py-4 transition-colors hover:bg-editorial-surface-soft",
                        item.is_read && "opacity-70",
                      )}
                      onClick={() => {
                        if (!item.is_read) handleMarkRead(item.id);
                        if (item.link) window.open(item.link, "_blank");
                      }}
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] font-medium",
                            src?.type === "social"
                              ? "bg-editorial-accent-soft text-editorial-accent"
                              : "bg-editorial-surface-soft",
                          )}
                        >
                          {src?.type === "rss" ? <Rss size={10} /> : null}
                          {src?.title || t("feeds.unknownSource")}
                        </span>
                        {item.author && (
                          <span className="text-[12px] text-editorial-ink-muted">
                            {item.author}
                          </span>
                        )}
                      </div>

                      <h3 className="mb-1 text-[14px] font-medium leading-snug text-editorial-ink transition-colors line-clamp-2">
                        {item.title}
                      </h3>

                      <p className="mb-2 text-[12px] leading-relaxed text-editorial-ink-soft line-clamp-2">
                        {item.description
                          ? item.description.replace(/<[^>]+>/g, "").substring(0, 300)
                          : ""}
                      </p>

                      {item.image && (
                        <img
                          src={item.image}
                          alt=""
                          className="mb-2 h-32 w-full rounded-lg object-cover"
                          loading="lazy"
                        />
                      )}

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 text-[12px] text-editorial-ink-muted">
                          <span>{formatTime(item.pub_date || item.fetched_at)}</span>
                        </div>
                        <ExternalLink size={12} className="text-editorial-ink-muted" />
                      </div>

                      {item.category &&
                        (() => {
                          try {
                            const cats = JSON.parse(item.category);
                            return Array.isArray(cats) && cats.length > 0 ? (
                              <div className="mt-2 flex gap-1.5">
                                {cats.slice(0, 3).map((c: string) => (
                                  <span
                                    key={c}
                                    className="rounded bg-editorial-surface-strong px-1.5 py-0.5 text-[12px] text-editorial-ink-muted"
                                  >
                                    {c}
                                  </span>
                                ))}
                              </div>
                            ) : null;
                          } catch {
                            return null;
                          }
                        })()}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
