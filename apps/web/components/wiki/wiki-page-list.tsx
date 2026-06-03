"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, Hash, Search } from "lucide-react";
import type { WikiPageListItem } from "@feedmind/contracts";
import { listWikiPages } from "@/lib/api/wiki";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface WikiPageListProps {
  spaceId: string;
  activePageId: string | null;
  onPageSelect: (pageId: string) => void;
}

export function WikiPageList({
  spaceId,
  activePageId,
  onPageSelect,
}: WikiPageListProps) {
  const [pages, setPages] = useState<WikiPageListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");

  const loadPages = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listWikiPages(spaceId, {
        q: search || undefined,
        type: typeFilter || undefined,
        limit: 100,
      });
      setPages(result.items);
    } catch {
      // handled by apiFetch toast
    } finally {
      setLoading(false);
    }
  }, [spaceId, search, typeFilter]);

  useEffect(() => {
    loadPages();
  }, [loadPages]);

  const filterTypes = ["", "entity", "concept", "source", "query"];

  return (
    <div className="flex h-full flex-col">
      {/* Search */}
      <div className="border-b border-border p-3">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-secondary-text"
          />
          <Input
            className="h-8 pl-7 text-xs"
            placeholder="搜索页面..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {filterTypes.map((t) => (
            <Button
              key={t}
              variant={typeFilter === t ? "default" : "ghost"}
              size="xs"
              onClick={() => setTypeFilter(t)}
            >
              {t || "全部"}
            </Button>
          ))}
        </div>
      </div>

      {/* Page list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-1 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <Skeleton className="h-3.5 w-3.5 shrink-0" />
                <Skeleton className="h-3.5 flex-1" />
                <Skeleton className="h-4 w-10 shrink-0 rounded-md" />
              </div>
            ))}
          </div>
        ) : pages.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6">
            <p className="text-xs text-secondary-text">暂无页面</p>
          </div>
        ) : (
          <div className="py-1">
            {pages.map((page) => (
              <button
                key={page.id}
                className={`flex w-full items-center gap-2 px-4 py-2 text-left text-xs transition-colors hover:bg-surface ${
                  activePageId === page.id
                    ? "bg-primary/5 text-primary"
                    : "text-foreground"
                }`}
                onClick={() => onPageSelect(page.id)}
              >
                <FileText size={14} className="shrink-0 text-secondary-text" />
                <span className="flex-1 truncate">{page.title}</span>
                <Badge variant="secondary" className="shrink-0 text-[10px]">
                  {page.type}
                </Badge>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
