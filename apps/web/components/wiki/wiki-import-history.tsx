"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { CheckCircle2, Clock, RefreshCw, XCircle, AlertCircle } from "lucide-react";
import type { IngestJob } from "@feedmind/contracts";
import { listIngestJobs, cancelIngestJob, retryIngestJob } from "@/lib/api/wiki";

import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { MotionSpinner } from "@/components/ui/motion-spinner";

// ─── Props ────────────────────────────────────────────────────

interface WikiImportHistoryProps {
  spaceId: string;
}

/** 展平后的虚拟行：active/history 组标题 或 单个任务卡片 */
type VirtualRow =
  | { kind: "activeHeader"; count: number }
  | { kind: "activeJob"; job: IngestJob }
  | { kind: "historyHeader"; count: number }
  | { kind: "historyJob"; job: IngestJob };

const rowPadding: Record<VirtualRow["kind"], string> = {
  activeHeader: "0.375rem",
  activeJob: "0.5rem",
  historyHeader: "1rem 0 0.375rem",
  historyJob: "0.375rem",
};

// ─── Component ─────────────────────────────────────────────────

export function WikiImportHistory({ spaceId }: WikiImportHistoryProps) {
  const { t } = useTranslation();
  const [jobs, setJobs] = useState<IngestJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const hasActive = jobs.some((job) => job.status === "pending" || job.status === "processing");

  const loadJobs = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      try {
        const result = await listIngestJobs(spaceId, signal);

        setJobs(result);
      } catch {
        // 错误由 apiFetch toast 统一提示
      } finally {
        setLoading(false);
      }
    },
    [spaceId],
  );

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  // 有活动任务时轮询
  useEffect(() => {
    if (!hasActive) return;

    const abortController = new AbortController();
    const interval = setInterval(() => {
      void loadJobs(abortController.signal);
    }, 5000);
    return () => {
      clearInterval(interval);
      abortController.abort();
    };
  }, [hasActive, loadJobs]);

  useEffect(() => {
    if (!hasActive) return;
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [hasActive]);

  const handleCancel = async (jobId: string) => {
    setCancelling(jobId);
    try {
      await cancelIngestJob(spaceId, jobId);
      await loadJobs();
    } catch {
      // 错误由 apiFetch toast 统一提示
    } finally {
      setCancelling(null);
    }
  };

  const handleRetry = async (jobId: string) => {
    try {
      await retryIngestJob(spaceId, jobId);
      await loadJobs();
    } catch {
      // 错误由 apiFetch toast 统一提示
    }
  };

  // 滚动容器元素用 state 管理：容器挂载/卸载时触发重渲染，让 virtualizer 的
  // _willUpdate 重新观测 scrollElement（修复首次挂载时容器未就绪导致空白）
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const activeJobs = useMemo(
    () => jobs.filter((j) => j.status === "pending" || j.status === "processing"),
    [jobs],
  );
  const historyJobs = useMemo(
    () =>
      jobs
        .filter((j) => j.status === "done" || j.status === "failed" || j.status === "cancelled")
        .sort((a, b) => (b.completed_at ?? b.added_at) - (a.completed_at ?? a.added_at)),
    [jobs],
  );

  // 展平为虚拟行：active 组标题 + 任务卡片 + history 组标题 + 任务卡片
  const rows = useMemo<VirtualRow[]>(() => {
    const result: VirtualRow[] = [];
    if (activeJobs.length > 0) {
      result.push({ kind: "activeHeader", count: activeJobs.length });
      for (const job of activeJobs) result.push({ kind: "activeJob", job });
    }
    if (historyJobs.length > 0) {
      result.push({ kind: "historyHeader", count: historyJobs.length });
      for (const job of historyJobs) result.push({ kind: "historyJob", job });
    }
    return result;
  }, [activeJobs, historyJobs]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollEl,
    estimateSize: (index) => {
      const row = rows[index]!;
      if (row.kind === "activeHeader" || row.kind === "historyHeader") return 26;
      return row.kind === "activeJob" ? 92 : 58;
    },
    overscan: 6,
    getItemKey: (index) => {
      const row = rows[index]!;
      return row.kind === "activeHeader"
        ? "active-header"
        : row.kind === "historyHeader"
          ? "history-header"
          : `${row.kind}:${row.job.id}`;
    },
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-editorial-surface-card">
      {/* 头部 */}
      <div className="flex items-center justify-between border-b border-editorial-surface-strong px-6 py-3">
        <div>
          <h2 className="text-[14px] font-semibold text-editorial-ink">
            {t("wiki.importHistory")}
          </h2>
          <p className="mt-0.5 text-[12px] text-editorial-ink-muted">
            {t("wiki.noImportHistoryDesc")}
          </p>
        </div>
        <button
          onClick={() => void loadJobs()}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-editorial-ink-muted hover:bg-editorial-surface-soft"
          title={t("wiki.refresh")}
        >
          {loading ? <MotionSpinner size={14} /> : <RefreshCw size={14} />}
        </button>
      </div>

      {/* 内容列表（active + history 统一虚拟化） */}
      <div ref={setScrollEl} className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
        {loading && jobs.length === 0 ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-md" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-editorial-surface-soft">
              <Clock size={18} className="text-editorial-ink-muted" />
            </div>
            <p className="text-[13px] font-medium text-editorial-ink">
              {t("wiki.noImportHistory")}
            </p>
          </div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualizer.getVirtualItems().map((item) => {
              const row = rows[item.index]!;
              return (
                <div
                  key={item.key}
                  ref={virtualizer.measureElement}
                  data-index={item.index}
                  className="absolute left-0 top-0 w-full"
                  style={{
                    transform: `translateY(${item.start}px)`,
                    // historyHeader 是 1rem/0/0.375rem 三段值，必须用 padding 简写而非 padding-bottom 单值
                    padding: rowPadding[row.kind],
                  }}
                >
                  {row.kind === "activeHeader" && (
                    <h3 className="text-[12px] font-semibold text-editorial-primary">
                      {t("wiki.importingCount", { count: row.count })}
                    </h3>
                  )}
                  {row.kind === "activeJob" && (
                    <ActiveJobCard
                      job={row.job}
                      now={now}
                      onCancel={(id) => void handleCancel(id)}
                      cancelling={cancelling === row.job.id}
                    />
                  )}
                  {row.kind === "historyHeader" && (
                    <h3 className="text-[12px] font-semibold text-editorial-ink-muted">
                      {t("wiki.completedCount", { count: row.count })}
                    </h3>
                  )}
                  {row.kind === "historyJob" && (
                    <HistoryJobCard job={row.job} onRetry={(id) => void handleRetry(id)} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Active Job Card ───────────────────────────────────────────

function ActiveJobCard({
  job,
  now,
  onCancel,
  cancelling,
}: {
  job: IngestJob;
  now: number;
  onCancel: (id: string) => void;
  cancelling: boolean;
}) {
  const { t } = useTranslation();
  const displayName = job.source_title ?? job.source_path.split("/").pop() ?? job.source_path;
  const elapsed = job.started_at
    ? formatDuration(Math.max(0, now - job.started_at))
    : formatDuration(Math.max(0, now - job.added_at));

  const progress = job.progress;
  const statusText = progress
    ? t("wiki.stepsProgress", { step: progress.step, total: progress.totalSteps })
    : job.status === "processing"
      ? t("wiki.statusProcessing")
      : t("wiki.statusPending");

  return (
    <div className="rounded-lg border border-editorial-surface-strong bg-editorial-canvas-soft px-4 py-3">
      <div className="flex items-center gap-3">
        <MotionSpinner size={16} className="text-editorial-primary" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-editorial-ink">{displayName}</p>
          <p className="text-[12px] text-editorial-ink-muted">
            {statusText}
            {" · "}
            {elapsed}
          </p>
        </div>
        {job.status === "pending" && (
          <button
            onClick={() => onCancel(job.id)}
            disabled={cancelling}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-editorial-ink-muted hover:bg-editorial-surface-strong hover:text-editorial-semantic-error disabled:opacity-50"
            title={t("wiki.cancel")}
          >
            {cancelling ? <MotionSpinner size={12} /> : <XCircle size={14} />}
          </button>
        )}
      </div>
      {progress && (
        <div className="mt-2.5 space-y-1.5">
          <div className="flex items-center gap-1.5">
            {Array.from({ length: progress.totalSteps }, (_, i) => {
              const filled = i < progress.step;
              return (
                <div
                  key={i}
                  className={`h-1.5 flex-1 rounded-md ${
                    filled ? "bg-editorial-primary" : "bg-editorial-surface-strong"
                  }`}
                />
              );
            })}
          </div>
          <p className="text-[12px] text-editorial-ink-muted">
            {t("wiki.stepDetail", {
              step: progress.step,
              total: progress.totalSteps,
              message: progress.message,
            })}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── History Job Card ──────────────────────────────────────────

function HistoryJobCard({ job, onRetry }: { job: IngestJob; onRetry: (id: string) => void }) {
  const { t, i18n } = useTranslation();
  const displayName = job.source_title ?? job.source_path.split("/").pop() ?? job.source_path;

  const icon =
    job.status === "done" ? (
      <CheckCircle2 size={16} className="text-editorial-semantic-success shrink-0" />
    ) : job.status === "failed" ? (
      <AlertCircle size={16} className="text-editorial-semantic-error shrink-0" />
    ) : (
      <XCircle size={16} className="text-editorial-ink-muted shrink-0" />
    );

  const time = job.completed_at
    ? formatTime(job.completed_at, t, i18n.language)
    : job.started_at
      ? formatTime(job.started_at, t, i18n.language)
      : formatTime(job.added_at, t, i18n.language);

  return (
    <div className="flex items-center gap-3 rounded-lg px-4 py-2.5 hover:bg-editorial-canvas-soft">
      {icon}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-editorial-ink">{displayName}</p>
        <p className="text-[12px] text-editorial-ink-muted">
          {job.status === "done" && (
            <>
              {t("wiki.done")} · {job.pages_created ?? 0} {t("wiki.pagesCreated")}，
              {job.pages_updated ?? 0} {t("wiki.pagesUpdated")} · {time}
            </>
          )}
          {job.status === "failed" && (
            <>
              {t("wiki.failed")} · {time}
            </>
          )}
          {job.status === "cancelled" && (
            <>
              {t("wiki.cancelled")} · {time}
            </>
          )}
        </p>
        {job.status === "failed" && job.error && (
          <p className="mt-0.5 whitespace-normal break-words text-[12px] leading-relaxed text-editorial-semantic-error">
            {job.error}
          </p>
        )}
      </div>
      {job.status === "failed" && (
        <button
          onClick={() => onRetry(job.id)}
          className="flex h-7 items-center gap-1 rounded-lg px-2.5 text-[12px] font-medium text-editorial-primary hover:bg-editorial-primary/10"
        >
          <RefreshCw size={11} />
          {t("wiki.retry")}
        </button>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m${remainingSeconds}s`;
}

// 时间显示：7 天内相对（刚刚/X分钟前/X小时前/X天前），超过一周显示本地化具体日期（参照信息流页面）
function formatTime(ts: number, t: TFunction, lang: string): string {
  const date = new Date(ts);
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return t("time.justNow");
  if (minutes < 60) return t("time.minutesAgo", { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("time.hoursAgo", { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t("time.daysAgo", { n: days });
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat(lang, {
    month: "long",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(date);
}
