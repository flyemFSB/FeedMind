"use client";

import { useCallback, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { FileText, Globe, Play, Trash2, Type } from "lucide-react";
import { deleteWikiSource, previewDeleteImpact, runIngest } from "@/lib/api/wiki";
import { useWikiSources } from "@/lib/hooks/use-wiki";
import { useQueryClient } from "@tanstack/react-query";
import { wikiOptions } from "@/lib/hooks/use-wiki";
import { Badge } from "@/components/ui/badge";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { MotionSpinner } from "@/components/ui/motion-spinner";
import { fadeSlideVariants, listContainerVariants, listItemVariants } from "@/lib/motion";
import { useTranslation } from "react-i18next";

interface WikiSourcesViewProps {
  spaceId: string;
}

export function WikiSourcesView({ spaceId }: WikiSourcesViewProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data, isLoading } = useWikiSources(spaceId);
  const sources = data?.items ?? [];

  const [ingestingIds, setIngestingIds] = useState<Set<string>>(new Set());
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
          <Badge variant="default" className="text-[12px] bg-editorial-semantic-success">
            {t("wiki.sourceIngested")}
          </Badge>
        );
      case "ready":
        return (
          <Badge variant="outline" className="text-[12px] text-editorial-ink-muted">
            {t("wiki.sourcePending")}
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive" className="text-[12px]">
            {t("wiki.sourceFailed")}
          </Badge>
        );
      case "ingesting":
        return (
          <Badge
            variant="secondary"
            className="text-[12px] bg-editorial-semantic-warning text-white"
          >
            {t("wiki.sourceIngesting")}
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-[12px]">
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
          <h2 className="text-[14px] font-semibold text-editorial-ink">
            {t("wiki.sourceManagement")}
          </h2>
          <p className="mt-0.5 text-[12px] text-editorial-ink-muted">
            {t("wiki.sourceDescription")}
          </p>
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
            <p className="text-[14px] font-medium text-editorial-ink">{t("wiki.noSources")}</p>
            <p className="mt-1 text-[12px] text-editorial-ink-muted">{t("wiki.noSourcesHint")}</p>
          </div>
        ) : (
          <motion.div
            className="divide-y divide-editorial-surface-soft"
            variants={listContainerVariants}
            initial="initial"
            animate="animate"
          >
            {sources.map((source) => (
              <motion.div
                key={source.id}
                layout
                variants={listItemVariants}
                className="flex items-center gap-4 px-6 py-3 hover:bg-editorial-canvas-soft group"
              >
                <div className="text-editorial-ink-muted shrink-0">{kindIcon(source.kind)}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-editorial-ink">
                    {source.title}
                  </p>
                  <p className="text-[12px] text-editorial-ink-muted">
                    {source.original_name ?? source.identity}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {statusBadge(source.status)}
                  {source.page_count > 0 && (
                    <span className="text-[12px] text-editorial-ink-muted">
                      {t("wiki.pageCount", { count: source.page_count })}
                    </span>
                  )}
                </div>
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
            ))}
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
              className="mx-4 mb-3 mt-2 rounded-lg border border-editorial-surface-strong bg-editorial-canvas-soft px-4 py-2.5 text-[12px] leading-relaxed text-editorial-ink shadow-sm"
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
