"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  XCircle,
  AlertCircle,
  FileText,
  X,
} from "lucide-react";
import type { IngestJob } from "@feedmind/contracts";
import {
  listIngestJobs,
  cancelIngestJob,
  retryIngestJob,
} from "@/lib/api/wiki";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

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
  const [jobs, setJobs] = useState<IngestJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listIngestJobs(spaceId);
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
    const interval = setInterval(loadJobs, 5000);
    return () => clearInterval(interval);
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
      <DialogContent showCloseButton={false} className="max-w-lg gap-0 rounded-2xl bg-white p-0 text-[#1d1d1f] sm:max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-4">
          <DialogTitle className="text-[16px] font-semibold">导入历史</DialogTitle>
          <div className="flex items-center gap-2">
            <button
              onClick={loadJobs}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[#86868b] transition-colors hover:bg-[#f5f5f7]"
              title="刷新"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[#86868b] transition-colors hover:bg-[#f5f5f7]"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Active imports */}
        {activeJobs.length > 0 && (
          <div className="px-6 pt-5">
            <h3 className="mb-2 text-[12px] font-semibold text-[#0071e3]">
              正在导入 ({activeJobs.length})
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
          <h3 className="mb-2 text-[12px] font-semibold text-[#86868b]">
            已完成 ({historyJobs.length})
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
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#f5f5f7]">
                  <Clock size={18} className="text-[#86868b]" />
                </div>
                <p className="text-[13px] font-medium text-[#1d1d1f]">暂无导入记录</p>
                <p className="mt-1 text-[11px] text-[#86868b]">导入文档后记录将显示在此处</p>
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
  const displayName = job.sourceTitle || job.sourcePath.split("/").pop() || job.sourcePath;
  const elapsed = job.startedAt
    ? formatDuration(Date.now() - job.startedAt)
    : formatDuration(Date.now() - job.addedAt);

  return (
    <div className="flex items-center gap-3 rounded-xl border border-[#e8e8ed] bg-[#fafafc] px-4 py-3">
      <Loader2 size={16} className="animate-spin text-[#0071e3] shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-[#1d1d1f]">
          {displayName}
        </p>
        <p className="text-[11px] text-[#86868b]">
          {job.status === "processing" ? "处理中..." : "等待中..."}
          {" · "}
          {elapsed}
        </p>
      </div>
      {job.status === "pending" && (
        <button
          onClick={() => onCancel(job.id)}
          disabled={cancelling}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-[#86868b] transition-colors hover:bg-[#f0f0f2] hover:text-[#ff3b30] disabled:opacity-50"
          title="取消"
        >
          {cancelling ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <XCircle size={14} />
          )}
        </button>
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
  const displayName = job.sourceTitle || job.sourcePath.split("/").pop() || job.sourcePath;

  const icon =
    job.status === "done" ? (
      <CheckCircle2 size={16} className="text-[#34c759] shrink-0" />
    ) : job.status === "failed" ? (
      <AlertCircle size={16} className="text-[#ff3b30] shrink-0" />
    ) : (
      <XCircle size={16} className="text-[#86868b] shrink-0" />
    );

  const time = job.completedAt
    ? formatTime(job.completedAt)
    : job.startedAt
      ? formatTime(job.startedAt)
      : formatTime(job.addedAt);

  return (
    <div className="flex items-center gap-3 rounded-xl px-4 py-2.5 transition-colors hover:bg-[#fafafc]">
      {icon}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-[#1d1d1f]">
          {displayName}
        </p>
        <p className="text-[11px] text-[#86868b]">
          {job.status === "done" && (
            <>
              完成 · {job.pagesCreated ?? 0} 页创建，{job.pagesUpdated ?? 0} 页更新 · {time}
            </>
          )}
          {job.status === "failed" && (
            <>
              失败 · {time}
            </>
          )}
          {job.status === "cancelled" && (
            <>
              已取消 · {time}
            </>
          )}
        </p>
        {job.status === "failed" && job.error && (
          <p className="mt-0.5 truncate text-[10px] text-[#ff3b30]">{job.error}</p>
        )}
      </div>
      {job.status === "failed" && (
        <button
          onClick={() => onRetry(job.id)}
          className="flex h-7 items-center gap-1 rounded-lg px-2.5 text-[11px] font-medium text-[#0071e3] transition-colors hover:bg-[#e8f0fe]"
        >
          <RefreshCw size={11} />
          重试
        </button>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}秒`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}分${remainingSeconds}秒`;
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

  if (isToday) return `今天 ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();

  if (isYesterday) return `昨天 ${time}`;

  return `${date.getMonth() + 1}/${date.getDate()} ${time}`;
}
