"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Pencil } from "lucide-react";
import type { WikiBacklink, WikiPageRead } from "@feedmind/contracts";
import { getWikiBacklinks, getWikiPage } from "@/lib/api/wiki";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { WIKI_TYPE_COLORS, WIKI_TYPE_LABELS } from "./constants";
import { useTranslation } from "react-i18next";

interface WikiReaderProps {
  spaceId: string;
  pageId: string;
  onEdit: () => void;
  onNavigate: (target: string) => void;
}

const TYPE_COLORS = WIKI_TYPE_COLORS;

export function WikiReader({ spaceId, pageId, onEdit, onNavigate }: WikiReaderProps) {
  const { t } = useTranslation();
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
        <div className="flex items-center justify-between border-b border-editorial-surface-strong px-6 py-3">
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
        <p className="text-[13px] text-editorial-ink-muted">{t("wiki.noPage")}</p>
      </div>
    );
  }

  const typeColor = TYPE_COLORS[page.type] || "var(--color-editorial-ink-muted)";

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 border-b border-editorial-surface-strong px-6 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-[17px] font-semibold text-editorial-ink">
              {page.title}
            </h1>
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-medium text-white"
              style={{ backgroundColor: typeColor }}
            >
              {WIKI_TYPE_LABELS[page.type] || page.type}
            </span>
          </div>
          {page.path && (
            <p className="mt-0.5 text-[11px] text-editorial-ink-muted">{page.path}</p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
            className="h-8 gap-1.5 rounded-lg px-3 text-[12px] text-editorial-ink hover:bg-editorial-surface-soft"
          >
            <Pencil size={13} />
            {t("common.edit")}
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
                  className="rounded-full bg-editorial-surface-soft px-2.5 py-1 text-[10px] text-editorial-ink-soft"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {/* Sources */}
          {page.sources && page.sources.length > 0 && (
            <div className="mb-5 flex items-center gap-2 text-[11px] text-editorial-ink-muted">
              <span className="font-medium text-editorial-ink">{t("wiki.sources")}</span>
              {page.sources.map((s, i) => (
                <span key={i} className="rounded-md bg-editorial-surface-soft px-2 py-0.5">
                  {s}
                </span>
              ))}
            </div>
          )}

          {/* Frontmatter info card */}
          {page.frontmatter && (
            <div className="mb-6 rounded-xl border border-editorial-surface-strong bg-editorial-canvas-soft px-4 py-3 text-[11px] text-editorial-ink-soft">
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                {page.type && (
                  <span>
                    <span className="font-medium text-editorial-ink">{t("wiki.type")}：</span> {WIKI_TYPE_LABELS[page.type] || page.type}
                  </span>
                )}
                {page.sources && page.sources.length > 0 && (
                  <span>
                    <span className="font-medium text-editorial-ink">{t("wiki.sources")}：</span> {page.sources.length}
                  </span>
                )}
                {page.tags && page.tags.length > 0 && (
                  <span>
                    <span className="font-medium text-editorial-ink">{t("wiki.tags")}：</span> {page.tags.length}
                  </span>
                )}
                {page.related && page.related.length > 0 && (
                  <span>
                    <span className="font-medium text-editorial-ink">{t("wiki.related")}：</span> {page.related.length}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Markdown content */}
          <div className="prose prose-sm max-w-none text-[14px] leading-relaxed text-editorial-ink">
            <SimpleMarkdown content={page.content} onWikilinkClick={onNavigate} />
          </div>

          {/* Backlinks */}
          {backlinks.length > 0 && (
            <div className="mt-10 rounded-xl border border-editorial-surface-strong bg-editorial-canvas-soft p-4">
              <h3 className="mb-3 text-[13px] font-semibold text-editorial-ink">
                {t("wiki.backlinksCount", { count: backlinks.length })}
              </h3>
              <div className="space-y-1">
                {backlinks.map((bl) => (
                  <button
                    key={bl.page_id}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] text-editorial-primary transition-colors hover:bg-editorial-surface-soft"
                    onClick={() => onNavigate(bl.slug)}
                  >
                    <ArrowLeft size={12} className="shrink-0" />
                    <span className="truncate font-medium">{bl.title}</span>
                    <span className="shrink-0 text-[10px] text-editorial-ink-muted">{bl.path}</span>
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
              className="text-editorial-primary underline decoration-editorial-primary/30 underline-offset-2 hover:decoration-editorial-primary"
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
