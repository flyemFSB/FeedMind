"use client";

import { useEffect, useMemo, useState } from "react";
import { SigmaContainer, useLoadGraph, useRegisterEvents, useSetSettings, useSigma } from "@react-sigma/core";
import "@react-sigma/core/lib/style.css";
import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import { AlertTriangle, Layers, Maximize, Network, Palette, Search, ZoomIn, ZoomOut } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  COMMUNITY_COLORS,
  NODE_TYPE_COLORS,
  detectCommunities,
  detectGraphInsights,
} from "@/lib/wiki-graph";
import type {
  WikiGraphCommunity,
  WikiGraphEdge,
  WikiGraphInsight,
  WikiGraphNode,
} from "@/lib/types";

type ColorMode = "type" | "community";

interface WikiGraphPanelProps {
  nodes: WikiGraphNode[];
  edges: WikiGraphEdge[];
  onNodeSelect: (node: WikiGraphNode) => void;
}

const typeLabels: Record<string, string> = {
  entity: "实体",
  concept: "概念",
  source: "来源",
  synthesis: "综合",
  comparison: "对比",
  overview: "总览",
  query: "查询",
  other: "其他",
};

function nodeSize(linkCount: number, maxLinks: number): number {
  if (maxLinks <= 0) return 8;
  return 8 + Math.sqrt(linkCount / maxLinks) * 18;
}

/** 仅在首次挂载或节点/边变更时重建图谱布局，颜色由 ColorUpdater 单独管理。 */
function GraphLoader({
  nodes,
  edges,
  assignments,
}: {
  nodes: WikiGraphNode[];
  edges: WikiGraphEdge[];
  assignments: Map<string, number>;
}) {
  const loadGraph = useLoadGraph();

  useEffect(() => {
    const graph = new Graph({ type: "undirected" });
    const maxLinks = Math.max(...nodes.map((node) => node.linkCount), 1);

    for (const node of nodes) {
      const community = assignments.get(node.id) ?? 0;
      graph.addNode(node.id, {
        x: Math.random() * 100,
        y: Math.random() * 100,
        label: node.title,
        size: nodeSize(node.linkCount, maxLinks),
        color: NODE_TYPE_COLORS[node.type] ?? NODE_TYPE_COLORS.other,
        nodeType: node.type,
        community,
      });
    }

    const maxWeight = Math.max(...edges.map((edge) => edge.weight), 1);
    for (const edge of edges) {
      if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) continue;
      const normalizedWeight = edge.weight / maxWeight;
      graph.mergeEdge(edge.source, edge.target, {
        size: 0.6 + normalizedWeight * 3,
        color: `rgba(110, 110, 115, ${0.25 + normalizedWeight * 0.55})`,
        weight: edge.weight,
        relationType: edge.relationType,
      });
    }

    if (nodes.length > 1) {
      forceAtlas2.assign(graph, {
        iterations: 140,
        settings: {
          ...forceAtlas2.inferSettings(graph),
          gravity: 1,
          scalingRatio: 2,
          strongGravityMode: true,
          barnesHutOptimize: nodes.length > 50,
        },
      });
    }

    loadGraph(graph, true);
  }, [assignments, edges, loadGraph, nodes]);

  return null;
}

/** 在颜色模式切换时直接更新节点颜色，不重建布局。 */
function ColorUpdater({
  colorMode,
  assignments,
}: {
  colorMode: ColorMode;
  assignments: Map<string, number>;
}) {
  const sigma = useSigma();

  useEffect(() => {
    const graph = sigma.getGraph();
    graph.forEachNode((node) => {
      const attrs = graph.getNodeAttributes(node);
      if (colorMode === "community") {
        const community = assignments.get(node) ?? 0;
        graph.setNodeAttribute(node, "color", COMMUNITY_COLORS[community % COMMUNITY_COLORS.length]);
      } else {
        graph.setNodeAttribute(node, "color", NODE_TYPE_COLORS[attrs.nodeType] ?? NODE_TYPE_COLORS.other);
      }
    });
  }, [assignments, colorMode, sigma]);

  return null;
}

function GraphReducers({
  hoveredNode,
  highlightedNodes,
}: {
  hoveredNode: string | null;
  highlightedNodes: Set<string>;
}) {
  const sigma = useSigma();
  const setSettings = useSetSettings();

  useEffect(() => {
    setSettings({
      nodeReducer(node, data) {
        const activeNodes = highlightedNodes.size > 0 ? highlightedNodes : null;
        if (activeNodes) {
          return activeNodes.has(node)
            ? { ...data, highlighted: true, zIndex: 1 }
            : { ...data, color: "#d2d2d7", label: "" };
        }

        if (!hoveredNode) return data;
        const graph = sigma.getGraph();
        const neighbors = new Set(graph.neighbors(hoveredNode));
        neighbors.add(hoveredNode);
        return neighbors.has(node)
          ? { ...data, highlighted: true, zIndex: 1 }
          : { ...data, color: "#d2d2d7", label: "" };
      },
      edgeReducer(edge, data) {
        const graph = sigma.getGraph();
        const [source, target] = graph.extremities(edge);
        const activeNodes = highlightedNodes.size > 0 ? highlightedNodes : null;
        if (activeNodes) {
          return activeNodes.has(source) && activeNodes.has(target)
            ? { ...data, color: "#0071e3", size: Math.max(Number(data.size ?? 1), 3) }
            : { ...data, hidden: true };
        }
        if (!hoveredNode) return data;
        return source === hoveredNode || target === hoveredNode
          ? { ...data, color: "#0071e3", size: Math.max(Number(data.size ?? 1), 3) }
          : { ...data, hidden: true };
      },
    });
  }, [highlightedNodes, hoveredNode, setSettings, sigma]);

  return null;
}

function EventHandler({
  onNodeSelect,
  setHoveredNode,
  nodesById,
}: {
  onNodeSelect: (node: WikiGraphNode) => void;
  setHoveredNode: (nodeId: string | null) => void;
  nodesById: Map<string, WikiGraphNode>;
}) {
  const registerEvents = useRegisterEvents();

  useEffect(() => {
    registerEvents({
      clickNode({ node }) {
        const graphNode = nodesById.get(node);
        if (graphNode) onNodeSelect(graphNode);
      },
      enterNode({ node }) {
        setHoveredNode(node);
      },
      leaveNode() {
        setHoveredNode(null);
      },
    });
  }, [nodesById, onNodeSelect, registerEvents, setHoveredNode]);

  return null;
}

function ZoomControls() {
  const sigma = useSigma();

  return (
    <div className="absolute right-3 top-3 flex flex-col gap-1">
      <Button variant="outline" size="icon-sm" className="bg-background/85" onClick={() => sigma.getCamera().animatedZoom({ duration: 180 })} aria-label="放大图谱">
        <ZoomIn />
      </Button>
      <Button variant="outline" size="icon-sm" className="bg-background/85" onClick={() => sigma.getCamera().animatedUnzoom({ duration: 180 })} aria-label="缩小图谱">
        <ZoomOut />
      </Button>
      <Button variant="outline" size="icon-sm" className="bg-background/85" onClick={() => sigma.getCamera().animatedReset({ duration: 220 })} aria-label="适配图谱">
        <Maximize />
      </Button>
    </div>
  );
}

function CommunityLegend({ communities }: { communities: WikiGraphCommunity[] }) {
  return (
    <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
      {communities.map((community) => (
        <div key={community.id} className="flex items-center gap-2 text-[12px]">
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: COMMUNITY_COLORS[community.id % COMMUNITY_COLORS.length] }}
          />
          <span className="truncate">{community.topNodes[0] ?? `社区 ${community.id}`}</span>
          <span className="ml-auto text-muted-foreground">{community.nodeCount}</span>
          {community.cohesion < 0.15 && community.nodeCount >= 3 && (
            <AlertTriangle className="size-3 text-muted-foreground" />
          )}
        </div>
      ))}
    </div>
  );
}

function InsightsList({
  insights,
  activeInsightId,
  onSelectInsight,
}: {
  insights: WikiGraphInsight[];
  activeInsightId: string | null;
  onSelectInsight: (insight: WikiGraphInsight) => void;
}) {
  if (insights.length === 0) {
    return <p className="text-[12px] text-muted-foreground">当前图谱结构稳定，暂无明显弱连接或桥接提醒。</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {insights.map((insight) => (
        <button
          key={insight.id}
          type="button"
          onClick={() => onSelectInsight(insight)}
          className={cn(
            "rounded-lg border p-3 text-left transition-colors hover:bg-muted",
            activeInsightId === insight.id ? "border-primary bg-muted" : "border-border",
          )}
        >
          <div className="flex items-center gap-2">
            <Search className="size-3.5 text-muted-foreground" />
            <span className="truncate text-[12px] font-medium">{insight.title}</span>
          </div>
          <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{insight.description}</p>
        </button>
      ))}
    </div>
  );
}

export function WikiGraphPanel({ nodes, edges, onNodeSelect }: WikiGraphPanelProps) {
  const [colorMode, setColorMode] = useState<ColorMode>("type");
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [activeInsightId, setActiveInsightId] = useState<string | null>(null);
  const [highlightedNodes, setHighlightedNodes] = useState<Set<string>>(new Set());

  const { assignments, communities } = useMemo(() => detectCommunities(nodes, edges), [edges, nodes]);
  const insights = useMemo(
    () => detectGraphInsights(nodes, edges, assignments, communities),
    [assignments, communities, edges, nodes],
  );
  const nodesById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const typeCounts = useMemo(
    () =>
      nodes.reduce<Record<string, number>>((acc, node) => {
        acc[node.type] = (acc[node.type] ?? 0) + 1;
        return acc;
      }, {}),
    [nodes],
  );

  function selectInsight(insight: WikiGraphInsight) {
    const isActive = activeInsightId === insight.id;
    setActiveInsightId(isActive ? null : insight.id);
    setHighlightedNodes(isActive ? new Set() : new Set(insight.nodeIds));
  }

  if (nodes.length === 0) {
    return (
      <Card size="sm">
        <CardContent className="grid min-h-[360px] place-items-center text-center">
          <div>
            <Network className="mx-auto size-10 text-muted-foreground" />
            <p className="mt-3 text-[13px] font-medium">暂无图谱数据</p>
            <p className="mt-1 text-[12px] text-muted-foreground">导入页面并生成关系后，这里会显示知识网络。</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_280px] gap-4 max-xl:grid-cols-1">
      <Card size="sm" className="min-w-0 overflow-hidden">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>知识图谱</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant={colorMode === "type" ? "secondary" : "outline"}
              size="sm"
              onClick={() => setColorMode("type")}
            >
              <Palette data-icon="inline-start" />
              类型
            </Button>
            <Button
              variant={colorMode === "community" ? "secondary" : "outline"}
              size="sm"
              onClick={() => setColorMode("community")}
            >
              <Layers data-icon="inline-start" />
              社区
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="relative h-[560px] min-h-[420px] bg-muted/40 max-md:h-[460px]">
            <SigmaContainer
              className="h-full w-full"
              settings={{
                allowInvalidContainer: true,
                labelDensity: 0.12,
                labelRenderedSizeThreshold: 10,
                defaultNodeType: "circle",
                defaultEdgeType: "line",
              }}
            >
              <GraphLoader nodes={nodes} edges={edges} assignments={assignments} />
              <ColorUpdater colorMode={colorMode} assignments={assignments} />
              <GraphReducers hoveredNode={hoveredNode} highlightedNodes={highlightedNodes} />
              <EventHandler nodesById={nodesById} onNodeSelect={onNodeSelect} setHoveredNode={setHoveredNode} />
              <ZoomControls />
            </SigmaContainer>
            <div className="absolute bottom-3 left-3 max-w-[260px] rounded-lg border bg-background/90 p-3 shadow-sm backdrop-blur">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-[12px] font-semibold">{colorMode === "type" ? "节点类型" : "社区聚类"}</span>
                <Badge variant="secondary">{nodes.length} 节点</Badge>
              </div>
              {colorMode === "type" ? (
                <div className="flex flex-col gap-1">
                  {Object.entries(typeCounts).map(([type, count]) => (
                    <div key={type} className="flex items-center gap-2 text-[12px]">
                      <span className="size-2.5 rounded-full" style={{ backgroundColor: NODE_TYPE_COLORS[type] ?? NODE_TYPE_COLORS.other }} />
                      <span>{typeLabels[type] ?? type}</span>
                      <span className="ml-auto text-muted-foreground">{count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <CommunityLegend communities={communities} />
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex min-w-0 flex-col gap-4">
        <Card size="sm">
          <CardHeader>
            <CardTitle>图谱摘要</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-[13px]">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">节点</span>
              <span className="font-medium">{nodes.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">关系</span>
              <span className="font-medium">{edges.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">社区</span>
              <span className="font-medium">{communities.length}</span>
            </div>
            <Separator />
            <p className="text-[12px] text-muted-foreground">
              节点大小按连接数缩放，边粗细按 4 信号相关性权重缩放。
            </p>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle>图谱洞察</CardTitle>
          </CardHeader>
          <CardContent>
            <InsightsList insights={insights} activeInsightId={activeInsightId} onSelectInsight={selectInsight} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
