"use client";

import { useCallback, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { FileText, Globe, Play, Trash2, Type, XCircle } from "lucide-react";
import { cancelIngestJob, deleteWikiSource, previewDeleteImpact, runIngest } from "@/lib/api/wiki";
import { useIngestJobs, useWikiSources } from "@/lib/hooks/use-wiki";
import { useQueryClient } from "@tanstack/react-query";
import { wikiOptions } from "@/lib/hooks/use-wiki";
import type { IngestJob } from "@feedmind/contracts";
import { Badge } from "@/components/ui/badge";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { MotionSpinner } from "@/components/ui/motion-spinner";
import { fadeSlideVariants, listContainerVariants, listItemVariants } from "@/lib/motion";
import { useTranslation } from "react-i18next";

interface WikiSourcesViewProps {
  spaceId: string;
}

/** 任务是否仍在进行（驱动轮询与行内进度展示）。不用类型守卫：
 *  false 分支会让 TS 把 job 错误收窄（IngestJob 含全部状态，排除后成 never） */
function isActiveJob(job: IngestJob | undefined): boolean {
  return job !== undefined && (job.status === "pending" || job.status === "processing");
}

export function WikiSourcesView({ spaceId }: WikiSourcesViewProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  // 导入任务轮询（有活跃任务时 3s 自动刷新，见 useIngestJobs）
  const { data: jobs = [] } = useIngestJobs(spaceId);
  const hasActiveJob = jobs.some(isActiveJob);
  // 有活跃导入时来源列表同步轮询，完成后来源状态自动变为“已导入”
  const { data, isLoading } = useWikiSources(spaceId, {
    refetchInterval: hasActiveJob ? 5000 : false,
  });
  const sources = data?.items ?? [];

  // 每个来源关联其最新任务：同 source_path 可能先后有转换任务与导入任务（转换完成自动
  // 入队导入），按 added_at 倒序让最新（active）任务优先展示
  const jobBySource = useMemo(() => {
    const map = new Map<string, IngestJob>();
    const sorted = [...jobs].sort((a, b) => b.added_at - a.added_at);
    for (const job of sorted) {
      if (!map.has(job.source_path)) map.set(job.source_path, job);
    }
    return map;
  }, [jobs]);

  const [ingestingIds, setIngestingIds] = useState<Set<string>>(new Set());
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [ingestResult, setIngestResult] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [deleteImpact, setDeleteImpact] = useState<{
    willDelete: string[];
    willUpdate: string[];
  } | null>(null);
  const invalidateSources = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: wikiOptions.sources(spaceId).queryKey });
    void queryClient.invalidateQueries({ queryKey: wikiOptions.jobs(spaceId).queryKey });
  }, [queryClient, spaceId]);

  // 先预览删除影响，再弹确认框，避免用户对删除范围没有概念
  const requestDelete = useCallback(
    async (source: { id: string; title: string }) => {
      setDeleteTarget(source);
      setDeleteImpact(null);
      try {
        const impact = await previewDeleteImpact(spaceId, source.id);
        setDeleteImpact(impact);
      } catch {
        // 错误由 apiFetch toast 统一处理
      }
    },
    [spaceId],
  );

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await deleteWikiSource(spaceId, deleteTarget.id, "detach");
      setDeleteTarget(null);
      invalidateSources();
    } catch {
      // 错误由 apiFetch toast 统一处理，保留弹窗以便重试
    }
  };

  const handleIngest = async (sourceIdentity: string, sourceTitle: string) => {
    // 用 Set 记录正在导入的来源，允许多个来源同时排队导入、各自独立显示 spinner
    setIngestingIds((prev) => new Set(prev).add(sourceIdentity));
    setIngestResult(null);
    try {
      const result = await runIngest(spaceId, sourceIdentity);
      setIngestResult(
        `✓ "${sourceTitle}": ${result.pagesCreated} ${t("wiki.pagesCreated")}，${result.pagesUpdated} ${t("wiki.pagesUpdated")}`,
      );
      invalidateSources();
    } catch (err) {
      setIngestResult(
        `✗ "${sourceTitle}": ${err instanceof Error ? err.message : t("wiki.uploadFailed")}`,
      );
    } finally {
      setIngestingIds((prev) => {
        const next = new Set(prev);
        next.delete(sourceIdentity);
        return next;
      });
      invalidateSources();
    }
  };

  const handleCancel = async (jobId: string) => {
    setCancellingId(jobId);
    try {
      await cancelIngestJob(spaceId, jobId);
    } catch {
      // 错误由 apiFetch toast 统一处理
    } finally {
      setCancellingId(null);
      invalidateSources();
    }
  };

  const kindIcon = (kind: string) => {
    switch (kind) {
      case "url":
        return <Globe size={14} />;
      case "text":
        return <Type size={14} />;
      default:
        return <FileText size={14} />;
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "ingested":
        return (
          <Badge
            variant="secondary"
            className="text-xs bg-editorial-semantic-success/15 text-editorial-semantic-success border border-editorial-semantic-success/20"
          >
            {t("wiki.sourceIngested")}
          </Badge>
        );
      case "ready":
        return (
          <Badge variant="outline" className="text-xs text-editorial-ink-muted">
            {t("wiki.sourcePending")}
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive" className="text-xs">
            {t("wiki.sourceFailed")}
          </Badge>
        );
      case "ingesting":
        return (
          <Badge
            variant="secondary"
            className="text-xs bg-editorial-semantic-warning/15 text-editorial-semantic-warning border border-editorial-semantic-warning/20"
          >
            {t("wiki.sourceIngesting")}
          </Badge>
        );
      case "converting":
        return (
          <Badge
            variant="secondary"
            className="text-xs bg-editorial-semantic-warning/15 text-editorial-semantic-warning border border-editorial-semantic-warning/20"
          >
            {t("wiki.sourceConverting")}
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-xs">
            {status}
          </Badge>
        );
    }
  };

  return (
    <div className="flex h-full flex-col bg-editorial-surface-card">
      {/* 头部 */}
      <div className="flex items-center justify-between border-b border-editorial-surface-strong px-6 py-3">
        <div>
          <h2 className="text-sm font-semibold text-editorial-ink">{t("wiki.sourceManagement")}</h2>
          <p className="mt-0.5 text-xs text-editorial-ink-muted">{t("wiki.sourceDescription")}</p>
        </div>
      </div>

      {/* 来源列表 */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-3 p-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-4 w-4 shrink-0 rounded" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-5 w-16 shrink-0 rounded-md" />
              </div>
            ))}
          </div>
        ) : sources.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center py-24 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-md bg-editorial-surface-soft">
              <FileText size={20} className="text-editorial-ink-muted" />
            </div>
            <p className="text-sm font-medium text-editorial-ink">{t("wiki.noSources")}</p>
            <p className="mt-1 text-xs text-editorial-ink-muted">{t("wiki.noSourcesHint")}</p>
          </div>
        ) : (
          <motion.div
            className="divide-y divide-editorial-surface-soft"
            variants={listContainerVariants}
            initial="initial"
            animate="animate"
          >
            {sources.map((source) => {
              // 行内导入状态：job 优先（进行中/失败），否则用来源自身状态
              const job = jobBySource.get(source.identity);
              const activeJob = isActiveJob(job);
              const failedJob = job?.status === "failed";
              // 转换任务：folder_context 非空（存临时文件名的上传二进制任务），
              // 显示“解析中”而非“摄取中”，两者的进度轮询共用一套
              const isConvertingJob = Boolean(job?.folder_context);
              const displayStatus = activeJob
                ? isConvertingJob
                  ? "converting"
                  : "ingesting"
                : failedJob
                  ? "failed"
                  : source.status;
              const subLine = activeJob
                ? job?.progress
                  ? `${t("wiki.stepsProgress", {
                      step: job.progress.step,
                      total: job.progress.totalSteps,
                    })} · ${job.progress.message}`
                  : isConvertingJob
                    ? t("wiki.statusConverting")
                    : job?.status === "processing"
                      ? t("wiki.statusProcessing")
                      : t("wiki.statusPending")
                : failedJob
                  ? (job?.error ?? t("wiki.processFailed"))
                  : (source.original_name ?? source.identity);

              return (
                <motion.div
                  key={source.id}
                  layout
                  variants={listItemVariants}
                  className="flex items-center gap-4 px-6 py-3 hover:bg-editorial-canvas-soft group"
                >
                  <div className="text-editorial-ink-muted shrink-0">{kindIcon(source.kind)}</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body font-medium text-editorial-ink">
                      {source.title}
                    </p>
                    <p
                      title={subLine}
                      className={`truncate text-xs ${
                        failedJob ? "text-destructive" : "text-editorial-ink-muted"
                      }`}
                    >
                      {subLine}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {statusBadge(displayStatus)}
                    {source.page_count > 0 && (
                      <span className="text-xs text-editorial-ink-muted">
                        {t("wiki.pageCount", { count: source.page_count })}
                      </span>
                    )}
                  </div>
                  {activeJob ? (
                    <motion.button
                      onClick={() => void handleCancel(job!.id)}
                      whileHover={{ scale: 1.08, opacity: 1 }}
                      whileTap={{ scale: 0.9 }}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-editorial-ink-muted opacity-0 hover:bg-editorial-surface-strong hover:text-editorial-semantic-error group-hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editorial-primary focus-visible:ring-offset-1 disabled:opacity-50"
                      title={t("wiki.cancel")}
                      disabled={cancellingId === job!.id}
                    >
                      {cancellingId === job!.id ? (
                        <MotionSpinner size={12} />
                      ) : (
                        <XCircle size={13} />
                      )}
                    </motion.button>
                  ) : (
                    <motion.button
                      onClick={() => handleIngest(source.identity, source.title)}
                      disabled={ingestingIds.has(source.identity)}
                      whileHover={{ scale: 1.08, opacity: 1 }}
                      whileTap={{ scale: 0.9 }}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-editorial-ink-muted opacity-0 hover:bg-editorial-surface-strong hover:text-editorial-primary group-hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editorial-primary focus-visible:ring-offset-1 disabled:opacity-50"
                      title={
                        ingestingIds.has(source.identity)
                          ? t("wiki.ingestingTitle")
                          : t("wiki.runIngest")
                      }
                    >
                      {ingestingIds.has(source.identity) ? (
                        <MotionSpinner size={12} />
                      ) : (
                        <Play size={12} />
                      )}
                    </motion.button>
                  )}
                  <motion.button
                    onClick={() => requestDelete(source)}
                    whileHover={{ scale: 1.08, opacity: 1 }}
                    whileTap={{ scale: 0.9 }}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-editorial-ink-muted opacity-0 hover:bg-editorial-surface-strong hover:text-editorial-semantic-error group-hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editorial-primary focus-visible:ring-offset-1"
                    title={t("wiki.deleteSource")}
                  >
                    <Trash2 size={13} />
                  </motion.button>
                </motion.div>
              );
            })}
          </motion.div>
        )}

        {/* 导入结果提示 */}
        <AnimatePresence initial={false}>
          {ingestResult && (
            <motion.div
              key="ingest-result"
              variants={fadeSlideVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="mx-4 mb-3 mt-2 rounded-lg border border-editorial-surface-strong bg-editorial-canvas-soft px-4 py-2.5 text-xs leading-relaxed text-editorial-ink shadow-sm"
            >
              {ingestResult}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.92 }}
                className="ml-2 text-editorial-ink-muted hover:text-editorial-ink"
                onClick={() => setIngestResult(null)}
              >
                ✕
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <DeleteConfirmDialog
        open={deleteTarget != null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void handleDeleteConfirm()}
        title={t("wiki.deleteSource")}
        description={
          deleteTarget
            ? t("wiki.deleteImpactConfirm", {
                deleteCount: deleteImpact?.willDelete.length ?? 0,
                updateCount: deleteImpact?.willUpdate.length ?? 0,
              })
            : undefined
        }
      />
    </div>
  );
}
