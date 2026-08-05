"use client";

import { useRef, useState } from "react";
import { motion } from "motion/react";
import { FileText, Search } from "lucide-react";
import type { WikiPageListItem } from "@feedmind/contracts";
import { useWikiPages } from "@/lib/hooks/use-wiki";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { sortWikiTypes, wikiTypeColor, wikiTypeLabel } from "./constants";
import { useTranslation } from "react-i18next";
import { listContainerVariants, listItemVariants } from "@/lib/motion";

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
            className="h-8 rounded-md border-editorial-hairline-strong bg-editorial-surface-card pl-8 text-[12px] placeholder:text-editorial-ink-muted focus:border-editorial-accent"
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
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-editorial-surface-soft">
              <FileText size={16} className="text-editorial-ink-muted" />
            </div>
            <p className="text-[13px] font-medium text-editorial-ink">
              {search || typeFilter ? t("wiki.noMatch") : t("wiki.noPageTitle")}
            </p>
            <p className="mt-1 text-[12px] text-editorial-ink-muted">
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
  const { i18n } = useTranslation();
  const grouped = pages.reduce<Record<string, WikiPageListItem[]>>((acc, page) => {
    const t = page.type || "other";
    if (!acc[t]) acc[t] = [];
    acc[t].push(page);
    return acc;
  }, {});

  const sortedTypes = sortWikiTypes(Object.keys(grouped));

  return (
    <motion.div
      className="px-2 py-1"
      variants={listContainerVariants}
      initial="initial"
      animate="animate"
    >
      {sortedTypes.map((type) => (
        <motion.div key={type} layout className="mb-4">
          <div className="flex items-center gap-2 px-3 py-1.5 mb-0.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
              style={{
                backgroundColor: wikiTypeColor(type),
              }}
            />
            <span className="text-[12px] font-medium text-editorial-ink-muted">
              {wikiTypeLabel(type, i18n.language)}
            </span>
            <span className="text-[12px] text-editorial-hairline">{grouped[type].length}</span>
          </div>
          {grouped[type].map((page) => (
            <PageListItem
              key={page.id}
              page={page}
              active={activePageId === page.id}
              onClick={() => onPageSelect(page.id)}
            />
          ))}
        </motion.div>
      ))}
    </motion.div>
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
      className={`shrink-0 rounded-md px-2.5 py-1 text-[12px] font-medium ${
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
      layout
      variants={listItemVariants}
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
        <span className="block truncate text-[13px] font-medium">{page.title}</span>
      </div>
    </motion.button>
  );
}
