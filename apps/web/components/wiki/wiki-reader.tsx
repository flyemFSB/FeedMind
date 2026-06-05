"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Pencil } from "lucide-react";
import type { WikiBacklink, WikiPageRead } from "@feedmind/contracts";
import { getWikiBacklinks, getWikiPage } from "@/lib/api/wiki";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { WIKI_TYPE_COLORS } from "./constants";

interface WikiReaderProps {
  spaceId: string;
  pageId: string;
  onEdit: () => void;
  onNavigate: (target: string) => void;
}

const TYPE_COLORS = WIKI_TYPE_COLORS;

export function WikiReader({ spaceId, pageId, onEdit, onNavigate }: WikiReaderProps) {
  const [page, setPage] = useState<WikiPageRead | null>(null);
  const [backlinks, setBacklinks] = useState<WikiBacklink[]>([]);
  const [loading, setLoading] = useState(true);
  const loadIdRef = useRef(0);

  const loadPage = useCallback(async () => {
    const loadId = ++loadIdRef.current;
    setLoading(true);
    try {
      const [result, links] = await Promise.all([
        getWikiPage(spaceId, pageId),
        getWikiBacklinks(spaceId, pageId),
      ]);
      if (loadId !== loadIdRef.current) return; // stale
      setPage(result);
      setBacklinks(links);
    } catch {
      // handled by apiFetch toast
    } finally {
      if (loadId === loadIdRef.current) setLoading(false);
    }
  }, [spaceId, pageId]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-[#e8e8ed] px-6 py-3">
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
        <p className="text-[13px] text-[#86868b]">页面不存在</p>
      </div>
    );
  }

  const typeColor = TYPE_COLORS[page.type] || "#86868b";

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 border-b border-[#e8e8ed] px-6 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-[17px] font-semibold text-[#1d1d1f]">
              {page.title}
            </h1>
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-medium text-white"
              style={{ backgroundColor: typeColor }}
            >
              {page.type}
            </span>
          </div>
          {page.path && (
            <p className="mt-0.5 text-[11px] text-[#86868b]">{page.path}</p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
            className="h-8 gap-1.5 rounded-lg px-3 text-[12px] text-[#1d1d1f] hover:bg-[#f5f5f7]"
          >
            <Pencil size={13} />
            编辑
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[720px] px-8 py-6">
          {/* Tags */}
          {page.tags && page.tags.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-1.5">
              {page.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-[#f0f0f2] px-2.5 py-1 text-[10px] text-[#6e6e73]"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {/* Sources */}
          {page.sources && page.sources.length > 0 && (
            <div className="mb-5 flex items-center gap-2 text-[11px] text-[#86868b]">
              <span className="font-medium text-[#1d1d1f]">来源</span>
              {page.sources.map((s, i) => (
                <span key={i} className="rounded-md bg-[#f5f5f7] px-2 py-0.5">
                  {s}
                </span>
              ))}
            </div>
          )}

          {/* Frontmatter info card */}
          {page.frontmatter && (
            <div className="mb-6 rounded-xl border border-[#e8e8ed] bg-[#fafafc] px-4 py-3 text-[11px] text-[#6e6e73]">
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                {page.type && (
                  <span>
                    <span className="font-medium text-[#1d1d1f]">Type:</span> {page.type}
                  </span>
                )}
                {page.sources && page.sources.length > 0 && (
                  <span>
                    <span className="font-medium text-[#1d1d1f]">Sources:</span> {page.sources.length}
                  </span>
                )}
                {page.tags && page.tags.length > 0 && (
                  <span>
                    <span className="font-medium text-[#1d1d1f]">Tags:</span> {page.tags.length}
                  </span>
                )}
                {page.related && page.related.length > 0 && (
                  <span>
                    <span className="font-medium text-[#1d1d1f]">Related:</span> {page.related.length}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Markdown content */}
          <div className="prose prose-sm max-w-none text-[14px] leading-relaxed text-[#1d1d1f]">
            <SimpleMarkdown content={page.content} onWikilinkClick={onNavigate} />
          </div>

          {/* Backlinks */}
          {backlinks.length > 0 && (
            <div className="mt-10 rounded-xl border border-[#e8e8ed] bg-[#fafafc] p-4">
              <h3 className="mb-3 text-[13px] font-semibold text-[#1d1d1f]">
                反向链接 ({backlinks.length})
              </h3>
              <div className="space-y-1">
                {backlinks.map((bl) => (
                  <button
                    key={bl.page_id}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] text-[#0071e3] transition-colors hover:bg-[#f0f0f5]"
                    onClick={() => onNavigate(bl.slug)}
                  >
                    <ArrowLeft size={12} className="shrink-0" />
                    <span className="truncate font-medium">{bl.title}</span>
                    <span className="shrink-0 text-[10px] text-[#86868b]">{bl.path}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Simple Markdown renderer with wikilink support ───────────

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
              className="text-[#0071e3] underline decoration-[#0071e3]/30 underline-offset-2 hover:decoration-[#0071e3]"
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
