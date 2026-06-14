"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  XCircle,
  AlertCircle,


  X,
} from "lucide-react";
import type { IngestJob } from "@feedmind/contracts";
import {
  listIngestJobs,
  cancelIngestJob,
  retryIngestJob,
} from "@/lib/api/wiki";


import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "react-i18next";

// ─── Props ────────────────────────────────────────────────────

interface WikiImportHistoryProps {
  open: boolean;
  spaceId: string;
  onClose: () => void;
}

// ─── Component ─────────────────────────────────────────────────

export function WikiImportHistory({
  open,
  spaceId,
  onClose,
}: WikiImportHistoryProps) {
  const { t } = useTranslation();
  const [jobs, setJobs] = useState<IngestJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const loadJobs = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const result = await listIngestJobs(spaceId, signal);

      setJobs(result);
    } catch {
      // handled by apiFetch toast
    } finally {
      setLoading(false);
    }
  }, [spaceId]);

  useEffect(() => {
    if (open) loadJobs();
  }, [open, loadJobs]);

  // Poll for active jobs
  useEffect(() => {
    if (!open) return;
    const hasActive = jobs.some(
      (j) => j.status === "pending" || j.status === "processing",
    );
    if (!hasActive) return;

    const abortController = new AbortController();
    const interval = setInterval(async () => {
      await loadJobs(abortController.signal);
    }, 5000);
    return () => {
      clearInterval(interval);
      abortController.abort();
    };

  }, [open, jobs, loadJobs]);

  const handleCancel = async (jobId: string) => {
    setCancelling(jobId);
    try {
      await cancelIngestJob(spaceId, jobId);
      await loadJobs();
    } catch {
      // handled by apiFetch toast
    } finally {
      setCancelling(null);
    }
  };

  const handleRetry = async (jobId: string) => {
    try {
      await retryIngestJob(spaceId, jobId);
      await loadJobs();
    } catch {
      // handled by apiFetch toast
    }
  };

  const activeJobs = jobs.filter(
    (j) => j.status === "pending" || j.status === "processing",
  );
  const historyJobs = jobs.filter(
    (j) => j.status === "done" || j.status === "failed" || j.status === "cancelled",
  ).sort((a, b) => (b.completedAt ?? b.addedAt) - (a.completedAt ?? a.addedAt));

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent showCloseButton={false} className="max-w-lg gap-0 rounded-2xl bg-editorial-surface-card p-0 text-editorial-ink sm:max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-4">
          <DialogTitle className="text-[16px] font-semibold">{t("wiki.importHistory")}</DialogTitle>
          <div className="flex items-center gap-2">
            <button
              onClick={() => loadJobs()}

              className="flex h-7 w-7 items-center justify-center rounded-lg text-editorial-ink-muted transition-colors hover:bg-editorial-surface-soft"
              title={t("wiki.refresh")}
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-editorial-ink-muted transition-colors hover:bg-editorial-surface-soft"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Active imports */}
        {activeJobs.length > 0 && (
          <div className="px-6 pt-5">
            <h3 className="mb-2 text-[12px] font-semibold text-editorial-primary">
              {t("wiki.importingCount", { count: activeJobs.length })}
            </h3>
            <div className="space-y-2">
              {activeJobs.map((job) => (
                <ActiveJobCard
                  key={job.id}
                  job={job}
                  onCancel={handleCancel}
                  cancelling={cancelling === job.id}
                />
              ))}
            </div>
          </div>
        )}

        {/* History */}
        <div className={`${activeJobs.length > 0 ? "pt-4" : "pt-5"} px-6 pb-4`}>
          <h3 className="mb-2 text-[12px] font-semibold text-editorial-ink-muted">
            {t("wiki.completedCount", { count: historyJobs.length })}
          </h3>
          <div className="max-h-[280px] overflow-y-auto -mx-6 px-6">
            {loading && jobs.length === 0 ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-xl" />
                ))}
              </div>
            ) : historyJobs.length === 0 && activeJobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-editorial-surface-soft">
                  <Clock size={18} className="text-editorial-ink-muted" />
                </div>
                <p className="text-[13px] font-medium text-editorial-ink">{t("wiki.noImportHistory")}</p>
                <p className="mt-1 text-[11px] text-editorial-ink-muted">{t("wiki.noImportHistoryDesc")}</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {historyJobs.map((job) => (
                  <HistoryJobCard key={job.id} job={job} onRetry={handleRetry} />
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Active Job Card ───────────────────────────────────────────

function ActiveJobCard({
  job,
  onCancel,
  cancelling,
}: {
  job: IngestJob;
  onCancel: (id: string) => void;
  cancelling: boolean;
}) {
  const { t } = useTranslation();
  const displayName = job.sourceTitle || job.sourcePath.split("/").pop() || job.sourcePath;
  const elapsed = job.startedAt
    ? formatDuration(Date.now() - job.startedAt)
    : formatDuration(Date.now() - job.addedAt);

  const progress = job.progress;
  const statusText = progress
    ? t("wiki.stepsProgress", { step: progress.step, total: progress.totalSteps })
    : job.status === "processing"
      ? t("wiki.statusProcessing")
      : t("wiki.statusPending");

  return (
    <div className="rounded-xl border border-editorial-surface-strong bg-editorial-canvas-soft px-4 py-3">
      <div className="flex items-center gap-3">
        <Loader2 size={16} className="shrink-0 animate-spin text-editorial-primary" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-editorial-ink">
            {displayName}
          </p>
          <p className="text-[11px] text-editorial-ink-muted">
            {statusText}
            {" · "}
            {elapsed}
          </p>
        </div>
        {job.status === "pending" && (
          <button
            onClick={() => onCancel(job.id)}
            disabled={cancelling}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-editorial-ink-muted transition-colors hover:bg-editorial-surface-strong hover:text-editorial-semantic-error disabled:opacity-50"
            title={t("wiki.cancel")}
          >
            {cancelling ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <XCircle size={14} />
            )}
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
                  className={`h-1.5 flex-1 rounded-full transition-colors ${
                    filled ? "bg-editorial-primary" : "bg-editorial-surface-strong"
                  }`}
                />
              );
            })}
          </div>
          <p className="text-[10px] text-editorial-ink-muted">
            {t("wiki.stepDetail", { step: progress.step, total: progress.totalSteps, message: progress.message })}
          </p>
        </div>

      )}
    </div>
  );
}

// ─── History Job Card ──────────────────────────────────────────

function HistoryJobCard({
  job,
  onRetry,
}: {
  job: IngestJob;
  onRetry: (id: string) => void;
}) {
  const { t } = useTranslation();
  const displayName = job.sourceTitle || job.sourcePath.split("/").pop() || job.sourcePath;

  const icon =
    job.status === "done" ? (
      <CheckCircle2 size={16} className="text-editorial-semantic-success shrink-0" />
    ) : job.status === "failed" ? (
      <AlertCircle size={16} className="text-editorial-semantic-error shrink-0" />
    ) : (
      <XCircle size={16} className="text-editorial-ink-muted shrink-0" />
    );

  const time = job.completedAt
    ? formatTime(job.completedAt)
    : job.startedAt
      ? formatTime(job.startedAt)
      : formatTime(job.addedAt);

  return (
    <div className="flex items-center gap-3 rounded-xl px-4 py-2.5 transition-colors hover:bg-editorial-canvas-soft">
      {icon}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-editorial-ink">
          {displayName}
        </p>
        <p className="text-[11px] text-editorial-ink-muted">
          {job.status === "done" && (
            <>
              {t("wiki.done")} · {job.pagesCreated ?? 0} {t("wiki.pagesCreated")}，{job.pagesUpdated ?? 0} {t("wiki.pagesUpdated")} · {time}
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
          <p className="mt-0.5 truncate text-[10px] text-editorial-semantic-error">{job.error}</p>
        )}
      </div>
      {job.status === "failed" && (
        <button
          onClick={() => onRetry(job.id)}
          className="flex h-7 items-center gap-1 rounded-lg px-2.5 text-[11px] font-medium text-editorial-primary transition-colors hover:bg-editorial-primary/10"
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

function formatTime(ts: number): string {
  const date = new Date(ts);
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  const time = date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (isToday) return `Today ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();

  if (isYesterday) return `Yesterday ${time}`;

  return `${date.getMonth() + 1}/${date.getDate()} ${time}`;
}
