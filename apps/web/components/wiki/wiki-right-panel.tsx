"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FileText,
  Hash,
  Info,
  Link2,
  Network,
  Tag,
} from "lucide-react";
import type { WikiBacklink, WikiPageRead } from "@feedmind/contracts";
import { getWikiBacklinks, getWikiPage } from "@/lib/api/wiki";
import { Skeleton } from "@/components/ui/skeleton";
import { WIKI_TYPE_COLORS, WIKI_TYPE_LABELS } from "./constants";

// ─── Props ────────────────────────────────────────────────────

interface WikiRightPanelProps {
  spaceId: string;
  pageId: string | null;
  onNavigate: (target: string) => void;
  onClose?: () => void;
}

// ─── Component ─────────────────────────────────────────────────

export function WikiRightPanel({
  spaceId,
  pageId,
  onNavigate,
  onClose,
}: WikiRightPanelProps) {
  return (
    <div className="flex h-full w-[280px] shrink-0 flex-col border-l border-[#e8e8ed] bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#e8e8ed] px-4 py-2.5">
        <span className="text-[12px] font-semibold text-[#1d1d1f]">
          页面详情
        </span>
        {onClose && (
          <button
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded-md text-[#86868b] hover:bg-[#f5f5f7] hover:text-[#1d1d1f]"
          >
            <ChevronRight size={14} />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {pageId ? (
          <PageDetail
            spaceId={spaceId}
            pageId={pageId}
            onNavigate={onNavigate}
          />
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}

// ─── Page Detail (loads data) ─────────────────────────────────

function PageDetail({
  spaceId,
  pageId,
  onNavigate,
}: {
  spaceId: string;
  pageId: string;
  onNavigate: (target: string) => void;
}) {
  const [page, setPage] = useState<WikiPageRead | null>(null);
  const [backlinks, setBacklinks] = useState<WikiBacklink[]>([]);
  const [loading, setLoading] = useState(true);
  const loadIdRef = useRef(0);

  const load = useCallback(async () => {
    const loadId = ++loadIdRef.current;
    setLoading(true);
    try {
      const [p, bl] = await Promise.all([
        getWikiPage(spaceId, pageId),
        getWikiBacklinks(spaceId, pageId),
      ]);
      if (loadId !== loadIdRef.current) return;
      setPage(p);
      setBacklinks(bl);
    } catch {
      // handled by apiFetch toast
    } finally {
      if (loadId === loadIdRef.current) setLoading(false);
    }
  }, [spaceId, pageId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-3 w-20" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!page) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-[11px] text-[#86868b]">页面不存在</p>
      </div>
    );
  }

  const typeColor = WIKI_TYPE_COLORS[page.type] || "#86868b";

  return (
    <div className="space-y-4 p-4">
      {/* Type badge + title */}
      <div className="space-y-2">
        <span
          className="inline-block rounded-full px-2 py-0.5 text-[9px] font-medium text-white"
          style={{ backgroundColor: typeColor }}
        >
          {WIKI_TYPE_LABELS[page.type] || page.type}
        </span>
        <h3 className="text-[14px] font-semibold leading-snug text-[#1d1d1f]">
          {page.title}
        </h3>
      </div>

      {/* Metadata */}
      <MetadataCard page={page} />

      {/* Backlinks */}
      <Section title={`反向链接 (${backlinks.length})`} icon={Link2}>
        {backlinks.length === 0 ? (
          <p className="px-3 py-2 text-[11px] text-[#86868b]">暂无反向链接</p>
        ) : (
          <div className="space-y-0.5">
            {backlinks.slice(0, 10).map((bl) => (
              <button
                key={bl.page_id}
                onClick={() => onNavigate(bl.slug)}
                className="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-[#f5f5f7] group"
              >
                <ArrowLeft
                  size={11}
                  className="mt-0.5 shrink-0 text-[#86868b]"
                />
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-medium text-[#0071e3]">
                    {bl.title}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-[#86868b]">
                    {bl.path}
                  </span>
                </div>
              </button>
            ))}
            {backlinks.length > 10 && (
              <p className="px-3 pt-1 text-[10px] text-[#86868b]">
                还有 {backlinks.length - 10} 个...
              </p>
            )}
          </div>
        )}
      </Section>

      {/* Related pages */}
      {page.related && page.related.length > 0 && (
        <Section title={`相关页面 (${page.related.length})`} icon={BookOpen}>
          <div className="space-y-0.5">
            {page.related.map((rel, i) => (
              <button
                key={i}
                onClick={() => onNavigate(rel)}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] text-[#0071e3] transition-colors hover:bg-[#f5f5f7]"
              >
                <FileText size={11} className="shrink-0 text-[#86868b]" />
                <span className="truncate">{rel}</span>
              </button>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

// ─── Metadata Card ────────────────────────────────────────────

function MetadataCard({ page }: { page: WikiPageRead }) {
  const items: Array<{
    label: string;
    value: string | number;
    icon: React.ElementType;
  }> = [];

  if (page.path) {
    items.push({
      label: "路径",
      value: page.path,
      icon: FileText,
    });
  }
  if (page.tags && page.tags.length > 0) {
    items.push({
      label: "标签",
      value: page.tags.join(", "),
      icon: Tag,
    });
  }
  if (page.sources && page.sources.length > 0) {
    items.push({
      label: "来源",
      value: `${page.sources.length} 个`,
      icon: Info,
    });
  }
  if (page.related && page.related.length > 0) {
    items.push({
      label: "关联",
      value: `${page.related.length} 个`,
      icon: Network,
    });
  }

  return (
    <div className="rounded-xl border border-[#e8e8ed] bg-[#fafafc]">
      {items.map((item, i) => (
        <div
          key={item.label}
          className={`flex items-center gap-3 px-3 py-2 ${
            i < items.length - 1 ? "border-b border-[#e8e8ed]" : ""
          }`}
        >
          <item.icon
            size={12}
            className="shrink-0 text-[#86868b]"
            strokeWidth={1.5}
          />
          <span className="min-w-0 flex-1 truncate text-[11px] text-[#1d1d1f]">
            {item.value}
          </span>
          <span className="shrink-0 text-[9px] text-[#86868b] uppercase tracking-wider">
            {item.label}
          </span>
        </div>
      ))}
      {items.length === 0 && (
        <p className="px-3 py-3 text-[11px] text-[#86868b]">暂无元数据</p>
      )}
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 px-1">
        <Icon size={12} className="text-[#86868b]" strokeWidth={1.5} />
        <span className="text-[11px] font-medium text-[#1d1d1f]">{title}</span>
      </div>
      {children}
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#f5f5f7]">
        <Info size={16} className="text-[#86868b]" />
      </div>
      <p className="text-[12px] font-medium text-[#1d1d1f]">
        选择页面查看详情
      </p>
      <p className="mt-1 text-[10px] text-[#86868b]">
        反向链接、元数据将显示在此处
      </p>
    </div>
  );
}
