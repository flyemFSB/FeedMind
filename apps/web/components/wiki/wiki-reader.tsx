"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Pencil } from "lucide-react";
import type { WikiBacklink, WikiPageRead } from "@feedmind/contracts";
import { getWikiBacklinks, getWikiPage } from "@/lib/api/wiki";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface WikiReaderProps {
  spaceId: string;
  pageId: string;
  onEdit: () => void;
  onNavigate: (target: string) => void;
}

export function WikiReader({
  spaceId,
  pageId,
  onEdit,
  onNavigate,
}: WikiReaderProps) {
  const [page, setPage] = useState<WikiPageRead | null>(null);
  const [backlinks, setBacklinks] = useState<WikiBacklink[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPage = useCallback(async () => {
    setLoading(true);
    try {
      const [result, links] = await Promise.all([
        getWikiPage(spaceId, pageId),
        getWikiBacklinks(spaceId, pageId),
      ]);
      setPage(result);
      setBacklinks(links);
    } catch {
      // handled by apiFetch toast
    } finally {
      setLoading(false);
    }
  }, [spaceId, pageId]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="space-y-1.5">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-7 w-14 rounded-lg" />
        </div>
        <div className="flex-1 space-y-3 p-6">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
          <Skeleton className="h-3 w-4/6" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      </div>
    );
  }

  if (!page) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-xs text-secondary-text">页面不存在</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
        <div className="min-w-0">
          <h1 className="truncate text-[17px] font-semibold text-foreground">
            {page.title}
          </h1>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant="secondary" className="text-[10px]">
              {page.type}
            </Badge>
            {page.path && (
              <span className="text-[11px] text-secondary-text">
                {page.path}
              </span>
            )}
          </div>
        </div>
        <Button
          variant="default"
          size="sm"
          onClick={onEdit}
          className="shrink-0 gap-1.5"
        >
          <Pencil size={13} />
          编辑
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Tags */}
        {page.tags && page.tags.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-1.5">
            {page.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-[10px]">
                #{tag}
              </Badge>
            ))}
          </div>
        )}

        {/* Sources */}
        {page.sources && page.sources.length > 0 && (
          <div className="mb-5 text-xs text-secondary-text">
            <span className="font-medium text-foreground">来源: </span>
            {page.sources.join(", ")}
          </div>
        )}

        {/* Markdown content */}
        <div className="prose prose-sm max-w-none text-sm leading-relaxed text-foreground">
          <SimpleMarkdown
            content={page.content}
            onWikilinkClick={onNavigate}
          />
        </div>

        {/* Backlinks */}
        {backlinks.length > 0 && (
          <div className="mt-8 border-t border-border pt-5">
            <h3 className="mb-3 text-[13px] font-semibold text-foreground">
              反向链接 ({backlinks.length})
            </h3>
            <div className="space-y-1">
              {backlinks.map((bl) => (
                <button
                  key={bl.page_id}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-primary transition-colors hover:bg-surface"
                  onClick={() => onNavigate(bl.slug)}
                >
                  <ArrowLeft size={12} className="shrink-0" />
                  <span className="truncate">{bl.title}</span>
                  <span className="shrink-0 text-[10px] text-secondary-text">
                    {bl.path}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Simple Markdown renderer with wikilink support
function SimpleMarkdown({
  content,
  onWikilinkClick,
}: {
  content: string;
  onWikilinkClick: (target: string) => void;
}) {
  const parts = content.split(/(\[\[[^\]|]+\|?[^\]]*\]\])/g);

  return (
    <>
      {parts.map((part, i) => {
        const match = part.match(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/);
        if (match) {
          const target = match[1]!;
          const alias = match[2];
          return (
            <button
              key={i}
              className="text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary"
              onClick={() => onWikilinkClick(target)}
            >
              {alias || target}
            </button>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
