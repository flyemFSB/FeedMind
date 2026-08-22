"use client";

import { useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { FileText, Search } from "lucide-react";
import type { WikiPageListItem } from "@feedmind/contracts";
import { useWikiPages } from "@/lib/hooks/use-wiki";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { sortWikiTypes, wikiTypeColor, wikiTypeLabel } from "./constants";
import { useTranslation } from "react-i18next";

interface WikiPageListProps {
  spaceId: string;
  activePageId: string | null;
  onPageSelect: (pageId: string) => void;
}

export function WikiPageList({ spaceId, activePageId, onPageSelect }: WikiPageListProps) {
  const { t, i18n } = useTranslation();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  // 滚动容器元素用 state 管理：容器挂载/卸载时触发重渲染，让 virtualizer 的
  // _willUpdate 重新观测 scrollElement（修复首次挂载时容器未就绪导致空白）
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);

  const { data, isLoading } = useWikiPages(spaceId);

  const pages: WikiPageListItem[] = data?.items ?? [];

  const filteredPages = pages.filter((page) => {
    if (typeFilter && page.type !== typeFilter) return false;
    if (search && !page.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const filterTypes = () => sortWikiTypes([...new Set(pages.map((page) => page.type))]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setSearch("");
      searchInputRef.current?.blur();
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 py-3">
        <span className="text-body font-semibold text-editorial-ink">{t("wiki.page")}</span>
      </div>

      <div className="px-3 pb-2">
        <div className="relative">
          <Search
            size={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-editorial-ink-muted"
          />
          <Input
            ref={searchInputRef}
            className="h-8 rounded-md border-editorial-hairline-strong bg-editorial-surface-card pl-8 text-xs placeholder:text-editorial-ink-muted focus:border-editorial-accent"
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
            label={wikiTypeLabel(t, i18n.language)}
            active={typeFilter === t}
            onClick={() => setTypeFilter(t)}
          />
        ))}
      </div>

      <div ref={setScrollEl} className="flex-1 min-h-0 overflow-y-auto">
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
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-editorial-surface-soft">
              <FileText size={16} className="text-editorial-ink-muted" />
            </div>
            <p className="text-body font-medium text-editorial-ink">
              {search || typeFilter ? t("wiki.noMatch") : t("wiki.noPageTitle")}
            </p>
            <p className="mt-1 text-xs text-editorial-ink-muted">
              {search || typeFilter ? t("wiki.noMatchHint") : t("wiki.autoGenerateHint")}
            </p>
          </div>
        ) : (
          <CategorizedPageList
            pages={filteredPages}
            activePageId={activePageId}
            onPageSelect={onPageSelect}
            scrollEl={scrollEl}
          />
        )}
      </div>
    </div>
  );
}

/** 展平后的虚拟行：组标题 或 单个页面 */
type VirtualRow =
  | { kind: "header"; type: string; count: number }
  | { kind: "page"; page: WikiPageListItem };

function CategorizedPageList({
  pages,
  activePageId,
  onPageSelect,
  scrollEl,
}: {
  pages: WikiPageListItem[];
  activePageId: string | null;
  onPageSelect: (pageId: string) => void;
  scrollEl: HTMLDivElement | null;
}) {
  const { i18n } = useTranslation();

  // 分组展平：组标题与页面作为独立虚拟行（虚拟化按固定下标渲染，不支持嵌套层级）
  const rows = useMemo<VirtualRow[]>(() => {
    const grouped = pages.reduce<Record<string, WikiPageListItem[]>>((acc, page) => {
      const type = page.type || "other";
      acc[type] ??= [];
      acc[type].push(page);
      return acc;
    }, {});
    const sortedTypes = sortWikiTypes(Object.keys(grouped));
    const result: VirtualRow[] = [];
    for (const type of sortedTypes) {
      const group = grouped[type]!;
      result.push({ kind: "header", type, count: group.length });
      for (const page of group) result.push({ kind: "page", page });
    }
    return result;
  }, [pages]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollEl,
    estimateSize: (index) => (rows[index]!.kind === "header" ? 42 : 38),
    overscan: 8,
    getItemKey: (index) => {
      const row = rows[index]!;
      return row.kind === "header" ? `header:${row.type}` : `page:${row.page.id}`;
    },
  });

  return (
    <div className="px-2 py-1" style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
      {virtualizer.getVirtualItems().map((item) => {
        const row = rows[item.index]!;
        return (
          <div
            key={item.key}
            ref={virtualizer.measureElement}
            data-index={item.index}
            className="absolute left-0 top-0 w-full"
            style={{ transform: `translateY(${item.start}px)` }}
          >
            {row.kind === "header" ? (
              <GroupHeader
                type={row.type}
                count={row.count}
                lang={i18n.language}
                isFirst={item.index === 0}
              />
            ) : (
              <PageListItem
                page={row.page}
                active={activePageId === row.page.id}
                onClick={() => onPageSelect(row.page.id)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function GroupHeader({
  type,
  count,
  lang,
  isFirst,
}: {
  type: string;
  count: number;
  lang: string;
  /** 第一组无需顶部大间距（贴紧筛选区） */
  isFirst: boolean;
}) {
  return (
    <div className={isFirst ? "px-3 pb-1 pt-1" : "px-3 pb-1 pt-2.5"}>
      {/* 分类间分割线：第一组上方不需要 */}
      {!isFirst && <div className="mb-2 border-t border-editorial-hairline" />}
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: wikiTypeColor(type) }}
        />
        <span className="text-tiny font-semibold uppercase tracking-wide text-editorial-ink-soft">
          {wikiTypeLabel(type, lang)}
        </span>
        {/* 数量用圆圈包裹，视觉更聚焦 */}
        <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-editorial-surface-strong px-1 text-tiny tabular-nums text-editorial-ink-muted">
          {count}
        </span>
      </div>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.96 }}
      className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-medium ${
        active
          ? "bg-editorial-accent-soft text-editorial-accent"
          : "bg-transparent text-editorial-ink-muted hover:bg-editorial-surface-soft hover:text-editorial-ink-soft"
      }`}
    >
      {label}
    </motion.button>
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
  const color = wikiTypeColor(page.type);

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ x: 2 }}
      whileTap={{ scale: 0.99 }}
      className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
        active
          ? "bg-editorial-accent-soft text-editorial-accent"
          : "text-editorial-ink hover:bg-editorial-surface-strong"
      }`}
    >
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <div className="min-w-0 flex-1">
        <span className="block truncate text-body font-medium">{page.title}</span>
      </div>
    </motion.button>
  );
}
