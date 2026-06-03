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
        return <Badge variant="default" className="text-[10px]">ready</Badge>;
      case "failed":
        return <Badge variant="destructive" className="text-[10px]">failed</Badge>;
      case "ingesting":
        return <Badge variant="secondary" className="text-[10px]">ingesting</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-xs font-semibold text-foreground">来源管理</h2>
        <Button
          variant="default"
          size="xs"
          onClick={() => setShowCreate(!showCreate)}
          className="gap-1"
        >
          <Plus size={13} />
          新建来源
        </Button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="border-b border-border bg-surface px-4 py-3">
          <div className="mb-2.5">
            <label className="mb-1 block text-[11px] font-medium text-foreground">
              标题
            </label>
            <Input
              className="h-8 text-xs"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="来源标题"
            />
          </div>
          <div className="mb-3">
            <label className="mb-1 block text-[11px] font-medium text-foreground">
              内容
            </label>
            <Textarea
              className="min-h-[72px] text-xs"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="原始文本内容..."
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="xs"
              onClick={() => {
                setShowCreate(false);
                setTitle("");
                setContent("");
              }}
            >
              取消
            </Button>
            <Button
              variant="default"
              size="xs"
              onClick={handleCreate}
              disabled={creating || !title.trim()}
            >
              {creating ? "创建中..." : "创建"}
            </Button>
          </div>
        </div>
      )}

      {/* Source list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-3.5 w-3.5 shrink-0" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-2.5 w-20" />
                </div>
                <Skeleton className="h-4 w-12 shrink-0 rounded-md" />
              </div>
            ))}
          </div>
        ) : sources.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6">
            <p className="text-xs text-secondary-text">暂无来源</p>
          </div>
        ) : (
          <div>
            {sources.map((source) => (
              <div
                key={source.id}
                className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface"
              >
                <div className="text-secondary-text shrink-0">
                  {kindIcon(source.kind)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">
                    {source.title}
                  </p>
                  <p className="text-[11px] text-secondary-text">
                    {source.original_name ?? source.identity}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {statusBadge(source.status)}
                  <span className="text-[11px] text-secondary-text">
                    {source.page_count} 页
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => handleDelete(source.id)}
                  className="text-secondary-text hover:text-destructive"
                >
                  <Trash2 size={13} />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
