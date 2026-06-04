"use client";

import { useCallback, useEffect, useState } from "react";
import {
  FileText,
  Globe,
  Plus,
  Trash2,
  Type,
} from "lucide-react";
import type { WikiSourceListItem } from "@feedmind/contracts";
import {
  createWikiSource,
  deleteWikiSource,
  listWikiSources,
} from "@/lib/api/wiki";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

interface WikiSourcesViewProps {
  spaceId: string;
}

export function WikiSourcesView({ spaceId }: WikiSourcesViewProps) {
  const [sources, setSources] = useState<WikiSourceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [creating, setCreating] = useState(false);

  const loadSources = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listWikiSources(spaceId, { limit: 100 });
      setSources(result.items);
    } catch {
      // handled by apiFetch toast
    } finally {
      setLoading(false);
    }
  }, [spaceId]);

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  const handleCreate = async () => {
    if (!title.trim()) return;
    setCreating(true);
    try {
      await createWikiSource(spaceId, {
        kind: "text",
        title: title.trim(),
        content,
        metadata: {},
      });
      setTitle("");
      setContent("");
      setShowCreate(false);
      await loadSources();
    } catch {
      // handled by apiFetch toast
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (sourceId: string) => {
    try {
      await deleteWikiSource(spaceId, sourceId, "detach");
      await loadSources();
    } catch {
      // handled by apiFetch toast
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
        return <Badge variant="default" className="text-[10px] bg-[#34c759]">ready</Badge>;
      case "failed":
        return <Badge variant="destructive" className="text-[10px]">failed</Badge>;
      case "ingesting":
        return <Badge variant="secondary" className="text-[10px] bg-[#ff9500] text-white">ingesting</Badge>;
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
            管理原始资料，创建 Ingest 任务生成 Wiki 页面
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setShowCreate(!showCreate)}
          className="h-8 gap-1.5 rounded-lg bg-[#0071e3] px-3 text-[12px] text-white hover:bg-[#0066cc]"
        >
          <Plus size={13} />
          新建来源
        </Button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="border-b border-[#e8e8ed] bg-[#fafafc] px-6 py-4">
          <div className="mb-3">
            <label className="mb-1 block text-[11px] font-medium text-[#1d1d1f]">标题</label>
            <Input
              className="h-9 rounded-lg border-[#d2d2d7] text-[13px]"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="来源标题"
            />
          </div>
          <div className="mb-3">
            <label className="mb-1 block text-[11px] font-medium text-[#1d1d1f]">内容</label>
            <Textarea
              className="min-h-[80px] rounded-lg border-[#d2d2d7] text-[13px]"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="原始文本内容..."
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setShowCreate(false); setTitle(""); setContent(""); }}
              className="h-8 rounded-lg px-3 text-[12px] text-[#86868b] hover:bg-[#f0f0f2]"
            >
              取消
            </Button>
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={creating || !title.trim()}
              className="h-8 rounded-lg bg-[#0071e3] px-3 text-[12px] text-white hover:bg-[#0066cc]"
            >
              {creating ? "创建中..." : "创建"}
            </Button>
          </div>
        </div>
      )}

      {/* Source list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
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
            <p className="mt-1 text-[12px] text-[#86868b]">点击"新建来源"添加原始资料</p>
          </div>
        ) : (
          <div className="divide-y divide-[#f0f0f2]">
            {sources.map((source) => (
              <div
                key={source.id}
                className="flex items-center gap-4 px-6 py-3 transition-colors hover:bg-[#fafafc]"
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
                  onClick={() => handleDelete(source.id)}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-[#86868b] opacity-0 transition-opacity hover:bg-[#f0f0f2] hover:text-[#ff3b30] group-hover:opacity-100"
                  title="删除来源"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
