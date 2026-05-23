"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowUpDown, FileStack, Filter, Network, Plus, RefreshCw, Search, Sparkles, Table2 } from "lucide-react";
import { LayoutWrapper } from "@/components/app-shell/layout-wrapper";
import { WikiStats } from "@/components/wiki/wiki-stats";
import { WikiSpaceList } from "@/components/wiki/wiki-space-list";
import { WikiPageTable } from "@/components/wiki/wiki-page-table";
import { WikiPageDetailPanel } from "@/components/wiki/wiki-page-detail-panel";
import { WikiSourceList } from "@/components/wiki/wiki-source-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { getWikiGraph, listSources, listWikiPages } from "@/lib/api/wiki-spaces";
import type { WikiGraphNode, WikiGraphResponse, WikiPage, WikiSpace, WikiSource } from "@/lib/types";

type WikiViewMode = "pages" | "graph" | "sources";

interface WikiPageClientProps {
  spaces: WikiSpace[];
  pages: WikiPage[];
  graph: WikiGraphResponse | null;
  error: string | null;
}

const WikiGraphPanel = dynamic(
  () => import("@/components/wiki/wiki-graph-panel").then((mod) => mod.WikiGraphPanel),
  {
    ssr: false,
    loading: () => (
      <Card size="sm">
        <CardContent className="grid min-h-[360px] place-items-center text-[13px] text-muted-foreground">
          正在准备图谱画布...
        </CardContent>
      </Card>
    ),
  },
);

function graphNodeToPage(node: WikiGraphNode): WikiPage {
  return {
    id: node.id,
    title: node.title,
    source: node.source,
    status: node.status,
    type: node.type,
    chunkCount: 0,
    relationCount: node.linkCount,
    updatedAt: "图谱节点",
  };
}

export function WikiPageClient({ spaces, pages, graph: initialGraph, error: initialError }: WikiPageClientProps) {
  const [wikiSpaces] = useState<WikiSpace[]>(spaces);
  const [wikiPages, setWikiPages] = useState<WikiPage[]>(pages);
  const [graph, setGraph] = useState<WikiGraphResponse | null>(initialGraph);
  const [selectedWiki, setSelectedWiki] = useState(spaces[0]?.id ?? "");
  const [selectedPage, setSelectedPage] = useState<WikiPage | null>(null);
  const [viewMode, setViewMode] = useState<WikiViewMode>("graph");
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [sources, setSources] = useState<WikiSource[]>([]);

  const activeWiki = wikiSpaces.find((wiki) => wiki.id === selectedWiki) ?? wikiSpaces[0];
  const totalPages = wikiSpaces.reduce((sum, wiki) => sum + wiki.pageCount, 0);
  const totalRelations = graph?.stats.edgeCount ?? wikiPages.reduce((sum, page) => sum + page.relationCount, 0);

  const graphNodeIds = useMemo(
    () => new Set(graph?.nodes.map((node) => node.id) ?? []),
    [graph],
  );
  const graphLinkCounts = useMemo(
    () => new Map(graph?.nodes.map((node) => [node.id, node.linkCount]) ?? []),
    [graph],
  );
  const activeGraphPages = useMemo(
    () =>
      wikiPages.map((page) => ({
        ...page,
        relationCount: graphLinkCounts.get(page.id) ?? page.relationCount,
      })),
    [graphLinkCounts, wikiPages],
  );

  async function loadWikiData(spaceId: string): Promise<string | null> {
    const [pagesResult, graphResult, sourcesResult] = await Promise.allSettled([
      listWikiPages(spaceId),
      getWikiGraph(spaceId),
      listSources(spaceId),
    ]);

    if (pagesResult.status === "fulfilled") setWikiPages(pagesResult.value);
    if (graphResult.status === "fulfilled") setGraph(graphResult.value);
    if (sourcesResult.status === "fulfilled") setSources(sourcesResult.value);

    return [pagesResult, graphResult, sourcesResult].some((result) => result.status === "rejected")
      ? "部分 WIKI 数据加载失败，可稍后重试"
      : null;
  }

  async function selectWiki(spaceId: string) {
    setSelectedWiki(spaceId);
    setRefreshing(true);
    setError(null);
    try {
      setError(await loadWikiData(spaceId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载 WIKI 数据失败");
    } finally {
      setRefreshing(false);
    }
  }

  async function refreshGraph() {
    if (!selectedWiki) return;
    setRefreshing(true);
    setError(null);
    try {
      setError(await loadWikiData(selectedWiki));
    } catch (err) {
      setError(err instanceof Error ? err.message : "刷新 WIKI 数据失败");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <LayoutWrapper title="我的 WIKI" subtitle="沉淀来源、页面与关系图谱">
      <div className="h-full overflow-y-auto p-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-[24px] font-semibold tracking-[-0.2px]">我的 WIKI</h1>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                让来源、页面、实体与概念持续沉淀为可查询的个人研究网络。
              </p>
            </div>
            <Button>
              <Plus data-icon="inline-start" />
              新建 WIKI
            </Button>
          </div>

          <Card size="sm">
            <CardContent className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3 max-md:grid-cols-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="搜索 WIKI、页面、来源或标签..."
                  className="h-10 pl-9 text-[13px]"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline">
                  <Filter data-icon="inline-start" />
                  筛选
                </Button>
                <Button variant="outline">
                  <ArrowUpDown data-icon="inline-start" />
                  最近更新
                </Button>
                <Button
                  variant={viewMode === "pages" ? "secondary" : "outline"}
                  onClick={() => setViewMode("pages")}
                >
                  <Table2 data-icon="inline-start" />
                  页面
                </Button>
                <Button
                  variant={viewMode === "graph" ? "secondary" : "outline"}
                  onClick={() => setViewMode("graph")}
                >
                  <Network data-icon="inline-start" />
                  图谱
                </Button>
                <Button
                  variant={viewMode === "sources" ? "secondary" : "outline"}
                  onClick={() => setViewMode("sources")}
                >
                  <FileStack data-icon="inline-start" />
                  来源
                </Button>
              </div>
            </CardContent>
          </Card>

          {error && (
            <Card size="sm">
              <CardContent className="flex items-center justify-between gap-3 py-3 text-[13px]">
                <span className="text-destructive">{error}</span>
                <Button variant="outline" size="sm" onClick={refreshGraph}>
                  <RefreshCw data-icon="inline-start" />
                  重试
                </Button>
              </CardContent>
            </Card>
          )}

          <WikiStats
            wikiCount={wikiSpaces.length}
            pageCount={totalPages}
            relationCount={totalRelations}
            lastUpdate={activeWiki?.updatedAt ?? "-"}
          />

          <div className="grid grid-cols-[320px_minmax(0,1fr)] gap-5 max-lg:grid-cols-1">
            <WikiSpaceList
              wikiSpaces={wikiSpaces}
              selectedId={selectedWiki}
              onSelect={selectWiki}
            />
            <div className="flex min-w-0 flex-col gap-4">
              <Card size="sm">
                <CardHeader className="flex-row items-start justify-between">
                  <div>
                    <CardTitle>{activeWiki?.name ?? "WIKI 空间"}</CardTitle>
                    <CardDescription>{activeWiki?.description ?? "暂无空间数据"}</CardDescription>
                  </div>
                  <Button variant="secondary" size="sm" onClick={refreshGraph} disabled={refreshing}>
                    {refreshing ? <RefreshCw data-icon="inline-start" className="animate-spin" /> : <Sparkles data-icon="inline-start" />}
                    生成关系
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap items-center gap-3 text-[12px] text-muted-foreground">
                    <span>{activeWiki?.pageCount ?? 0} 个页面</span>
                    <Separator orientation="vertical" className="h-3" />
                    <span>{activeWiki?.sourceCount ?? 0} 个来源</span>
                    <Separator orientation="vertical" className="h-3" />
                    <span>{graph?.stats.edgeCount ?? 0} 条图谱关系</span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 max-sm:grid-cols-1">
                    <div className="rounded-lg bg-muted px-3 py-2">
                      <div className="text-[11px] text-muted-foreground">页面片段</div>
                      <div className="text-[15px] font-medium">
                        {(activeWiki?.chunkCount ?? 0).toLocaleString()}
                      </div>
                    </div>
                    <div className="rounded-lg bg-muted px-3 py-2">
                      <div className="text-[11px] text-muted-foreground">关系连接</div>
                      <div className="text-[15px] font-medium">{totalRelations}</div>
                    </div>
                    <div className="rounded-lg bg-muted px-3 py-2">
                      <div className="text-[11px] text-muted-foreground">图谱节点</div>
                      <div className="text-[15px] font-medium">{graphNodeIds.size}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {viewMode === "graph" && graph ? (
                <WikiGraphPanel
                  nodes={graph.nodes}
                  edges={graph.edges}
                  onNodeSelect={(node) => setSelectedPage(graphNodeToPage(node))}
                />
              ) : viewMode === "sources" ? (
                <div className="flex min-w-0 flex-col gap-4">
                  <WikiSourceList sources={sources} spaceId={selectedWiki} onRefresh={() => loadWikiData(selectedWiki)} />
                </div>
              ) : (
                <div className="flex min-w-0 flex-col gap-3">
                  <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                    <Network className="size-4" />
                    <span>页面、来源与实体关系会用于 WIKI 检索和图谱视图。</span>
                  </div>
                  <WikiPageTable pages={activeGraphPages} onSelect={setSelectedPage} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <WikiPageDetailPanel page={selectedPage} onClose={() => setSelectedPage(null)} />
    </LayoutWrapper>
  );
}
