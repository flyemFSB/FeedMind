"use client";

import type { ElementType } from "react";
import { useMemo, useState } from "react";
import { FileCode, Globe, Layers, MoreHorizontal, Plus } from "lucide-react";
import { WikiSpace } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

interface WikiSpaceListProps {
  wikiSpaces: WikiSpace[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const tagIcons: Record<string, ElementType> = {
  LangChain: FileCode,
  Tutorial: FileCode,
  前端: Globe,
  设计: Globe,
  开源: FileCode,
  代码: FileCode,
};

const filters = [
  { label: "全部", value: "all" },
  { label: "个人", value: "personal" },
  { label: "团队", value: "team" },
  { label: "网页", value: "web" },
  { label: "代码", value: "code" },
] as const;

export function WikiSpaceList({ wikiSpaces, selectedId, onSelect }: WikiSpaceListProps) {
  const [filter, setFilter] = useState<(typeof filters)[number]["value"]>("all");
  const visibleWikiSpaces = useMemo(
    () => wikiSpaces.filter((wiki) => filter === "all" || wiki.category === filter),
    [filter, wikiSpaces],
  );

  return (
    <Card size="sm">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>我的 WIKI</CardTitle>
        <Button variant="ghost" size="icon-sm" title="新建 WIKI">
          <Plus />
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Tabs
          value={filter}
          onValueChange={(value) => setFilter(value as (typeof filters)[number]["value"])}
        >
          <TabsList>
            {filters.map((filter) => (
              <TabsTrigger key={filter.value} value={filter.value} className="px-2.5 text-[12px]">
                {filter.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex flex-col gap-2">
          {visibleWikiSpaces.map((wiki) => (
            <button
              key={wiki.id}
              type="button"
              onClick={() => onSelect(wiki.id)}
              className={cn(
                "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                selectedId === wiki.id
                  ? "border-primary bg-muted"
                  : "border-transparent hover:bg-muted",
              )}
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
                <Layers className="size-4" strokeWidth={1.8} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-[14px] font-semibold">
                    {wiki.name}
                  </span>
                  {wiki.id === "wiki-product" && <Badge variant="secondary">活跃</Badge>}
                </span>
                <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                  {wiki.description}
                </span>
                <span className="mt-2 block text-[11px] text-muted-foreground">
                  {wiki.pageCount} 页面 · {wiki.sourceCount} 来源 · {wiki.updatedAt}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {wiki.tags.slice(0, 2).map((tag) => {
                  const Icon = tagIcons[tag] || Globe;
                  return (
                    <span
                      key={tag}
                      className="grid size-6 place-items-center rounded-md bg-muted"
                      title={tag}
                    >
                      <Icon className="size-3 text-muted-foreground" />
                    </span>
                  );
                })}
                <MoreHorizontal className="size-4 text-muted-foreground" />
              </span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
