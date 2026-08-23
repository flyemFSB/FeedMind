import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { Check, FileText, Globe, Play, RotateCw, Trash2, Type, XCircle } from "lucide-react";
import {
  cancelIngestJob,
  deleteWikiSource,
  enqueueIngestJob,
  previewDeleteImpact,
} from "@/lib/api/wiki";
import { useIngestJobs, useWikiSources } from "@/lib/hooks/use-wiki";
import { useQueryClient } from "@tanstack/react-query";
import { wikiOptions } from "@/lib/hooks/use-wiki";
import type { IngestJob } from "@feedmind/contracts";
import { Badge } from "@/components/ui/badge";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { MotionSpinner } from "@/components/ui/motion-spinner";
import { toast } from "@/components/ui/toast";
import { listContainerVariants, listItemVariants } from "@/lib/motion";
import { useTranslation } from "react-i18next";

interface WikiSourcesViewProps {
  spaceId: string;
}

/** 任务是否仍在进行（驱动轮询与行内进度展示）。不用类型守卫：
 *  false 分支会让 TS 把 job 错误收窄（IngestJob 含全部状态，排除后成 never） */
function isActiveJob(job: IngestJob | undefined): boolean {
  return job !== undefined && (job.status === "pending" || job.status === "processing");
}

function formatDateTimeStr(value: string | number | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function WikiSourcesView({ spaceId }: WikiSourcesViewProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  // 导入任务轮询（有活跃任务时 3s 自动刷新，见 useIngestJobs）
  const { data: jobs = [] } = useIngestJobs(spaceId);
  const hasActiveJob = jobs.some(isActiveJob);
  // 有活跃导入时来源列表同步轮询，完成后来源状态自动变为“已导入”
  const { data, isLoading } = useWikiSources(spaceId, {
    refetchInterval: hasActiveJob ? 3000 : false,
  });
  const sources = data?.items ?? [];

  // 每个来源关联其最新任务：同 source_path 可能先后有转换任务与导入任务（转换完成自动
  // 入队导入），多维度映射 key（identity/slug/title/original_name），按 added_at 倒序让最新任务优先展示
  const jobBySource = useMemo(() => {
    const map = new Map<string, IngestJob>();
    const sorted = [...jobs].sort((a, b) => b.added_at - a.added_at);
    for (const job of sorted) {
      const keys = [
        job.source_path,
        job.source_path.replace(/\.md$/i, ""),
        job.source_path.replace(/\.md$/i, "").toLowerCase(),
        job.source_title,
      ].filter(Boolean);
      for (const k of keys) {
        if (!map.has(k)) map.set(k, job);
      }
    }
    return map;
  }, [jobs]);

  // 活跃任务全部结束瞬间兜底刷新：worker 的 done 标记与 markSourceIngested 回写存在
  // 竞态窗口，轮询可能抓到旧值后停止，导致“待导入”残留到手动刷新；invalidate 强制再取
  const hasEverActive = useRef(false);
  useEffect(() => {
    if (hasActiveJob) {
      hasEverActive.current = true;
    } else if (hasEverActive.current) {
      hasEverActive.current = false;
      void queryClient.invalidateQueries({ queryKey: wikiOptions.sources(spaceId).queryKey });
      void queryClient.invalidateQueries({ queryKey: wikiOptions.jobs(spaceId).queryKey });
    }
  }, [hasActiveJob, queryClient, spaceId]);

  const [ingestingIds, setIngestingIds] = useState<Set<string>>(new Set());
  const [cancellingId, setCancellingId] = useState<string | null>(null);
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
      // delete-orphans：同时删除仅引用该来源的孤立页面（与确认弹窗的删除预览一致），
      // detach 只移除引用不删页面，与 UI 文案“将删除 N 个孤立页面”不符
      await deleteWikiSource(spaceId, deleteTarget.id, "delete-orphans");
      setDeleteTarget(null);
      invalidateSources();
    } catch {
      // 错误由 apiFetch toast 统一处理，保留弹窗以便重试
    }
  };

  const handleIngest = async (sourceIdentity: string, _sourceTitle: string) => {
    // 异步入队：与首次上传一致走队列 worker 处理，行内实时展示步骤进度条与取消按钮，
    // 彻底告别同步阻塞请求造成的按钮局部一直转圈
    setIngestingIds((prev) => new Set(prev).add(sourceIdentity));
    try {
      await enqueueIngestJob(spaceId, sourceIdentity);
      invalidateSources();
    } catch (err) {
      toast.add({
        title: t("wiki.uploadFailed"),
        description: err instanceof Error ? err.message : String(err),
        type: "error",
      });
    } finally {
      setIngestingIds((prev) => {
        const next = new Set(prev);
        next.delete(sourceIdentity);
        return next;
      });
    }
  };

  const handleCancel = async (jobId: string, sourceIdentity: string) => {
    setCancellingId(jobId);
    try {
      await cancelIngestJob(spaceId, jobId);
      // 取消即清理：删除来源的上传文件与转换 md（来源管理按上传文件展示，删后行消失）
      await deleteWikiSource(spaceId, sourceIdentity.replace(/\.md$/i, ""), "detach");
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
      case "pending":
        return (
          <Badge
            variant="outline"
            className="text-xs bg-editorial-surface-soft text-editorial-ink-muted border-editorial-surface-strong"
          >
            {t("wiki.sourceQueued")}
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
              // 行内导入状态：匹配关联任务（按多标识命中最新任务）
              const job =
                jobBySource.get(source.identity) ??
                jobBySource.get(source.id) ??
                jobBySource.get(source.title) ??
                (source.original_name ? jobBySource.get(source.original_name) : undefined);

              const activeJob = isActiveJob(job);
              const isJobProcessing = job?.status === "processing";
              const isJobPending = job?.status === "pending";
              const failedJob = job?.status === "failed" || source.status === "failed";
              const isConvertingJob = Boolean(job?.folder_context);

              const displayStatus = isJobProcessing
                ? isConvertingJob
                  ? "converting"
                  : "ingesting"
                : isJobPending
                  ? "pending"
                  : failedJob
                    ? "failed"
                    : source.status;

              const isIngested = displayStatus === "ingested";

              const subLine = isJobPending
                ? t("wiki.queueWaiting")
                : isJobProcessing
                  ? job?.progress
                    ? `${t("wiki.stepsProgress", {
                        step: job.progress.step,
                        total: job.progress.totalSteps,
                      })} · ${job.progress.message}`
                    : isConvertingJob
                      ? t("wiki.sourceConverting")
                      : t("wiki.sourceIngesting")
                  : failedJob
                    ? // 失败仍保留导入过程（进度）+ 失败原因：progress 记录失败前最后一步
                      job?.progress
                      ? `${t("wiki.stepsProgress", {
                          step: job.progress.step,
                          total: job.progress.totalSteps,
                        })} · ${job?.error ?? t("wiki.processFailed")}`
                      : (job?.error ?? t("wiki.processFailed"))
                    : isIngested
                      ? formatDateTimeStr(source.updated_at ?? source.created_at)
                      : (source.original_name ?? source.identity);

              const hoverTitle =
                isIngested && source.original_name
                  ? `${source.original_name} · ${subLine}`
                  : subLine;

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
                      title={hoverTitle}
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
                      onClick={() => void handleCancel(job!.id, source.identity)}
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
                  ) : source.status === "ingested" ? (
                    // 已导入来源不再提供重新导入入口（避免重复导入语义混乱）
                    <Check size={13} className="mr-0.5 text-editorial-semantic-success" />
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
                          : displayStatus === "failed"
                            ? t("wiki.reIngest")
                            : t("wiki.runIngest")
                      }
                    >
                      {ingestingIds.has(source.identity) ? (
                        <MotionSpinner size={12} />
                      ) : displayStatus === "failed" ? (
                        <RotateCw size={12} />
                      ) : (
                        <Play size={12} />
                      )}
                    </motion.button>
                  )}
                  {/* 进行中只保留取消按钮，避免操作冲突 */}
                  {!activeJob && (
                    <motion.button
                      onClick={() => requestDelete(source)}
                      whileHover={{ scale: 1.08, opacity: 1 }}
                      whileTap={{ scale: 0.9 }}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-editorial-ink-muted opacity-0 hover:bg-editorial-surface-strong hover:text-editorial-semantic-error group-hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editorial-primary focus-visible:ring-offset-1"
                      title={t("wiki.deleteSource")}
                    >
                      <Trash2 size={13} />
                    </motion.button>
                  )}
                </motion.div>
              );
            })}
          </motion.div>
        )}
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
