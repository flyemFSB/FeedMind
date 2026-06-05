"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Search } from "lucide-react";
import type { WikiPageListItem } from "@feedmind/contracts";
import { wikiPageTypeSchema } from "@feedmind/contracts";
import { useWikiPages, useInvalidateWiki } from "@/lib/wiki/queries";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { WIKI_TYPE_COLORS } from "./constants";

const TYPE_COLORS = WIKI_TYPE_COLORS;

interface WikiPageListProps {
  spaceId: string;
  activePageId: string | null;
  onPageSelect: (pageId: string) => void;
  refreshTrigger?: number;
}

export function WikiPageList({
  spaceId,
  activePageId,
  onPageSelect,
  refreshTrigger,
}: WikiPageListProps) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const invalidate = useInvalidateWiki();

  const { data, loading } = useWikiPages(spaceId, {
    q: search || undefined,
    type: typeFilter || undefined,
    limit: 200,
  });

  const pages = data?.items ?? [];

  useEffect(() => {
    if (refreshTrigger) invalidate(spaceId);
  }, [refreshTrigger]);

  const filterTypes = useCallback(() => {
    const types = new Set(pages.map((p) => p.type));
    return wikiPageTypeSchema.options.filter((t) => types.has(t));
  }, [pages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setSearch("");
      searchInputRef.current?.blur();
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 py-3">
        <span className="text-[13px] font-semibold text-[#1d1d1f]">页面</span>
      </div>

      <div className="px-3 pb-2">
        <div className="relative">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#86868b]" />
          <Input
            ref={searchInputRef}
            className="h-8 rounded-lg border-[#e8e8ed] pl-8 text-[12px] placeholder:text-[#86868b] focus:border-[#0071e3]"
            placeholder="搜索页面..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto px-3 pb-2">
        <FilterChip label="全部" active={typeFilter === ""} onClick={() => setTypeFilter("")} />
        {filterTypes().map((t) => (
          <FilterChip key={t} label={t} color={TYPE_COLORS[t]} active={typeFilter === t} onClick={() => setTypeFilter(t)} />
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-1 px-3 py-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2">
                <Skeleton className="h-3.5 w-3.5 shrink-0 rounded" />
                <div className="flex-1">
                  <Skeleton className="h-3.5 w-full" />
                </div>
                <Skeleton className="h-4 w-12 shrink-0 rounded-md" />
              </div>
            ))}
          </div>
        ) : pages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#f5f5f7]">
              <FileText size={16} className="text-[#86868b]" />
            </div>
            <p className="text-[13px] font-medium text-[#1d1d1f]">
              {search ? "没有匹配的页面" : "暂无页面"}
            </p>
            <p className="mt-1 text-[11px] text-[#86868b]">
              {search ? "尝试其他关键词" : "导入文档由 LLM 自动生成"}
            </p>
          </div>
        ) : (
          <CategorizedPageList pages={pages} activePageId={activePageId} onPageSelect={onPageSelect} />
        )}
      </div>
    </div>
  );
}

function CategorizedPageList({ pages, activePageId, onPageSelect }: {
  pages: WikiPageListItem[];
  activePageId: string | null;
  onPageSelect: (pageId: string) => void;
}) {
  const typeOrder = ["entity", "concept", "source", "overview", "index"];
  const typeLabels: Record<string, string> = {
    entity: "实体", concept: "概念", source: "来源",
    overview: "概览", index: "索引",
  };

  const grouped = pages.reduce<Record<string, WikiPageListItem[]>>((acc, page) => {
    const t = page.type || "other";
    if (!acc[t]) acc[t] = [];
    acc[t].push(page);
    return acc;
  }, {});

  const sortedTypes = Object.keys(grouped).sort((a, b) => {
    const ia = typeOrder.indexOf(a);
    const ib = typeOrder.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b, "zh-CN");
  });

  return (
    <div className="px-2 py-1">
      {sortedTypes.map((type) => (
        <div key={type} className="mb-4">
          <div className="flex items-center gap-2 px-3 py-1.5 mb-0.5">
            <span className="inline-block h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: WIKI_TYPE_COLORS[type] || "#86868b" }} />
            <span className="text-[11px] font-medium text-[#86868b]">{typeLabels[type] || type}</span>
            <span className="text-[10px] text-[#d2d2d7]">{grouped[type].length}</span>
          </div>
          {grouped[type].map((page) => (
            <PageListItem key={page.id} page={page} active={activePageId === page.id} onClick={() => onPageSelect(page.id)} />
          ))}
        </div>
      ))}
    </div>
  );
}

function FilterChip({
  label,
  color,
  active,
  onClick,
}: {
  label: string;
  color?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors ${
        active
          ? "bg-[#1d1d1f] text-white"
          : "bg-[#f0f0f2] text-[#6e6e73] hover:bg-[#e5e5e8]"
      }`}
    >
      {label}
    </button>
  );
}

function PageListItem({
  page,
  active,
  onClick,
}: {
  page: WikiPageListItem;
  active: boolean;
  onClick: () => void;
}) {
  const color = TYPE_COLORS[page.type] || "#86868b";

  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors ${
        active
          ? "bg-[#e8f0fe]"
          : "hover:bg-[#f5f5f7]"
      }`}
    >
      <FileText size={14} className="shrink-0 text-[#86868b]" strokeWidth={1.5} />
      <div className="min-w-0 flex-1">
        <span
          className={`block truncate text-[13px] ${
            active ? "font-medium text-[#0071e3]" : "text-[#1d1d1f]"
          }`}
        >
          {page.title}
        </span>
      </div>
      <span
        className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-medium text-white"
        style={{ backgroundColor: color }}
      >
        {page.type}
      </span>
    </button>
  );
}
