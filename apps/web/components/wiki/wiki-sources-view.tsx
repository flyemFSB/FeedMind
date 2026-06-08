"use client";

import { useCallback, useState } from "react";
import {
  FileText,
  Globe,
  Loader2,
  Play,
  Trash2,
  Type,
} from "lucide-react";
import {
  deleteWikiSource,
  runIngest,
} from "@/lib/api/wiki";
import { useWikiSources } from "@/lib/hooks/use-wiki";
import { useQueryClient } from "@tanstack/react-query";
import { wikiKeys } from "@/lib/hooks/use-wiki";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface WikiSourcesViewProps {
  spaceId: string;
}

export function WikiSourcesView({ spaceId }: WikiSourcesViewProps) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useWikiSources(spaceId);
  const sources = data?.items ?? [];

  const [ingestingId, setIngestingId] = useState<string | null>(null);
  const [ingestResult, setIngestResult] = useState<string | null>(null);

  const invalidateSources = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: wikiKeys.sources(spaceId) });
  }, [queryClient, spaceId]);

  const handleDelete = async (sourceId: string) => {
    try {
      await deleteWikiSource(spaceId, sourceId, "detach");
      invalidateSources();
    } catch {
      // handled by apiFetch toast
    }
  };

  const handleIngest = async (sourceIdentity: string, sourceTitle: string) => {
    setIngestingId(sourceIdentity);
    setIngestResult(null);
    try {
      const result = await runIngest(spaceId, sourceIdentity);
      setIngestResult(
        `✓ "${sourceTitle}": ${result.pagesCreated} 创建，${result.pagesUpdated} 更新`,
      );
      invalidateSources();
    } catch (err) {
      setIngestResult(
        `✗ "${sourceTitle}": ${err instanceof Error ? err.message : "未知错误"}`,
      );
    } finally {
      setIngestingId(null);
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
      case "ready":
        return <Badge variant="default" className="text-[10px] bg-[#34c759]">已就绪</Badge>;
      case "failed":
        return <Badge variant="destructive" className="text-[10px]">失败</Badge>;
      case "ingesting":
        return <Badge variant="secondary" className="text-[10px] bg-[#ff9500] text-white">摄取中</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
    }
  };

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#e8e8ed] px-6 py-3">
        <div>
          <h2 className="text-[15px] font-semibold text-[#1d1d1f]">来源管理</h2>
          <p className="mt-0.5 text-[11px] text-[#86868b]">
            上传文档后自动创建来源
          </p>
        </div>
      </div>

      {/* Source list */}
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
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#f5f5f7]">
              <FileText size={20} className="text-[#86868b]" />
            </div>
            <p className="text-[15px] font-medium text-[#1d1d1f]">暂无来源</p>
            <p className="mt-1 text-[12px] text-[#86868b]">在侧边栏点击"导入"上传文档自动创建</p>
          </div>
        ) : (
          <div className="divide-y divide-[#f0f0f2]">
            {sources.map((source) => (
              <div
                key={source.id}
                className="flex items-center gap-4 px-6 py-3 transition-colors hover:bg-[#fafafc] group"
              >
                <div className="text-[#86868b] shrink-0">{kindIcon(source.kind)}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-[#1d1d1f]">
                    {source.title}
                  </p>
                  <p className="text-[11px] text-[#86868b]">
                    {source.original_name ?? source.identity}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {statusBadge(source.status)}
                  {source.page_count > 0 && (
                    <span className="text-[11px] text-[#86868b]">{source.page_count} 页</span>
                  )}
                </div>
                <button
                  onClick={() => handleIngest(source.identity, source.title)}
                  disabled={ingestingId === source.identity}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-[#86868b] opacity-0 transition-opacity hover:bg-[#f0f0f2] hover:text-[#0071e3] group-hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3] focus-visible:ring-offset-1 disabled:opacity-50"
                  title={ingestingId === source.identity ? "摄取中..." : "运行摄取"}
                >
                  {ingestingId === source.identity ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Play size={12} />
                  )}
                </button>
                <button
                  onClick={() => handleDelete(source.id)}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-[#86868b] opacity-0 transition-opacity hover:bg-[#f0f0f2] hover:text-[#ff3b30] group-hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3] focus-visible:ring-offset-1"
                  title="删除来源"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Ingest result toast */}
        {ingestResult && (
          <div className="mx-4 mb-3 mt-2 rounded-lg border border-[#e8e8ed] bg-[#fafafc] px-4 py-2.5 text-[12px] leading-relaxed text-[#1d1d1f] shadow-sm">
            {ingestResult}
            <button
              className="ml-2 text-[#86868b] hover:text-[#1d1d1f]"
              onClick={() => setIngestResult(null)}
            >
              ✕
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
