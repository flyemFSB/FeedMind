"use client";

import { useRef, useState } from "react";
import { FileText, Search } from "lucide-react";
import type { WikiPageListItem } from "@feedmind/contracts";
import { wikiPageTypeSchema } from "@feedmind/contracts";
import { useWikiPages } from "@/lib/hooks/use-wiki";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { WIKI_TYPE_COLORS, WIKI_TYPE_LABELS } from "./constants";
import { useTranslation } from "react-i18next";

const TYPE_COLORS = WIKI_TYPE_COLORS;

interface WikiPageListProps {
  spaceId: string;
  activePageId: string | null;
  onPageSelect: (pageId: string) => void;
}

export function WikiPageList({ spaceId, activePageId, onPageSelect }: WikiPageListProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useWikiPages(spaceId);

  const pages: WikiPageListItem[] = data?.items ?? [];

  const filteredPages = pages.filter((page) => {
    if (typeFilter && page.type !== typeFilter) return false;
    if (search && !page.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const filterTypes = () => {
    const types = new Set(pages.map((p) => p.type));
    return wikiPageTypeSchema.options.filter((t) => types.has(t));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setSearch("");
      searchInputRef.current?.blur();
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 py-3">
        <span className="text-[13px] font-semibold text-editorial-ink">{t("wiki.page")}</span>
      </div>

      <div className="px-3 pb-2">
        <div className="relative">
          <Search
            size={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-editorial-ink-muted"
          />
          <Input
            ref={searchInputRef}
            className="h-8 rounded-lg border-editorial-surface-strong pl-8 text-[12px] placeholder:text-editorial-ink-muted focus:border-editorial-primary"
            placeholder={t("wiki.searchPages")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto px-3 pb-2">
        <FilterChip
          label={t("common.all")}
          active={typeFilter === ""}
          onClick={() => setTypeFilter("")}
        />
        {filterTypes().map((t) => (
          <FilterChip
            key={t}
            label={WIKI_TYPE_LABELS[t] || t}
            color={TYPE_COLORS[t]}
            active={typeFilter === t}
            onClick={() => setTypeFilter(t)}
          />
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
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
        ) : filteredPages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-editorial-surface-soft">
              <FileText size={16} className="text-editorial-ink-muted" />
            </div>
            <p className="text-[13px] font-medium text-editorial-ink">
              {search || typeFilter ? t("wiki.noMatch") : t("wiki.noPageTitle")}
            </p>
            <p className="mt-1 text-[11px] text-editorial-ink-muted">
              {search || typeFilter ? t("wiki.noMatchHint") : t("wiki.autoGenerateHint")}
            </p>
          </div>
        ) : (
          <CategorizedPageList
            pages={filteredPages}
            activePageId={activePageId}
            onPageSelect={onPageSelect}
          />
        )}
      </div>
    </div>
  );
}

function CategorizedPageList({
  pages,
  activePageId,
  onPageSelect,
}: {
  pages: WikiPageListItem[];
  activePageId: string | null;
  onPageSelect: (pageId: string) => void;
}) {
  const typeOrder = ["entity", "concept", "source", "overview", "index"];
  const typeLabels: Record<string, string> = {
    entity: "实体",
    concept: "概念",
    source: "来源",
    overview: "概览",
    index: "索引",
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
            <span
              className="inline-block h-2 w-2 rounded-full shrink-0"
              style={{
                backgroundColor: WIKI_TYPE_COLORS[type] || "var(--color-editorial-ink-muted)",
              }}
            />
            <span className="text-[11px] font-medium text-editorial-ink-muted">
              {typeLabels[type] || type}
            </span>
            <span className="text-[10px] text-editorial-hairline">{grouped[type].length}</span>
          </div>
          {grouped[type].map((page) => (
            <PageListItem
              key={page.id}
              page={page}
              active={activePageId === page.id}
              onClick={() => onPageSelect(page.id)}
            />
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
          ? "bg-editorial-ink text-editorial-ink-on-primary"
          : "bg-editorial-surface-soft text-editorial-ink-soft hover:bg-editorial-surface-strong"
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
  const color = TYPE_COLORS[page.type] || "var(--color-editorial-ink-muted)";

  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors ${
        active ? "bg-editorial-primary/10" : "hover:bg-editorial-surface-soft"
      }`}
    >
      <FileText size={14} className="shrink-0 text-editorial-ink-muted" strokeWidth={1.5} />
      <div className="min-w-0 flex-1">
        <span
          className={`block truncate text-[13px] ${
            active ? "font-medium text-editorial-primary" : "text-editorial-ink"
          }`}
        >
          {page.title}
        </span>
      </div>
      <span
        className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-medium text-white"
        style={{ backgroundColor: color }}
      >
        {WIKI_TYPE_LABELS[page.type] || page.type}
      </span>
    </button>
  );
}
