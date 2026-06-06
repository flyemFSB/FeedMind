"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Network, RefreshCw, ZoomIn, ZoomOut, Maximize, Search, Loader2, Type, Layers, Lightbulb, AlertTriangle, Link2, X } from "lucide-react";
import type { GraphNode, GraphEdge, CommunityInfo } from "@feedmind/contracts";
import { getWikiGraph, getWikiGraphInsights } from "@/lib/api/wiki";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { WIKI_TYPE_COLORS } from "./constants";

interface WikiGraphViewProps {
  spaceId: string;
  onPageSelect: (pageId: string) => void;
}

type ColorMode = "type" | "community";

const COMMUNITY_COLORS = [
  "#60a5fa", "#4ade80", "#fb923c", "#c084fc",
  "#f87171", "#2dd4bf", "#facc15", "#f472b6",
];

function nodeColor(type: string): string {
  return WIKI_TYPE_COLORS[type] ?? "#94a3b8";
}

export function WikiGraphView({ spaceId, onPageSelect }: WikiGraphViewProps) {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [communities, setCommunities] = useState<CommunityInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [colorMode, setColorMode] = useState<ColorMode>("type");
  const [searchQuery, setSearchQuery] = useState("");
  const [zoom, setZoom] = useState(1);
  const [insights, setInsights] = useState<{ surprising: any[]; gaps: any[] } | null>(null);
  const [showInsights, setShowInsights] = useState(false);

  const loadGraph = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const graph = await getWikiGraph(spaceId);
      setNodes(graph.nodes);
      setEdges(graph.edges);
      setCommunities(graph.communities);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load graph");
    } finally {
      setLoading(false);
    }
  }, [spaceId]);

  const loadInsights = useCallback(async () => {
    try {
      const data = await getWikiGraphInsights(spaceId);
      setInsights(data);
    } catch { /* ignore */ }
  }, [spaceId]);

  useEffect(() => { loadGraph(); }, [loadGraph]);

  // Simple ForceAtlas2-like positions computed on load
  const positions = useRef<Map<string, { x: number; y: number }>>(new Map());
  useEffect(() => {
    if (nodes.length === 0) return;
    const pos = new Map<string, { x: number; y: number }>();
    const n = nodes.length;
    // Simple circular layout with some randomization
    for (let i = 0; i < n; i++) {
      const angle = (2 * Math.PI * i) / n;
      const radius = 150 + Math.random() * 50;
      pos.set(nodes[i].id, {
        x: 300 + radius * Math.cos(angle),
        y: 300 + radius * Math.sin(angle),
      });
    }
    positions.current = pos;
  }, [nodes]);

  const filteredNodes = searchQuery
    ? nodes.filter((n) => n.label.toLowerCase().includes(searchQuery.toLowerCase()))
    : nodes;

  const filteredEdges = searchQuery
    ? edges.filter((e) => filteredNodes.some((n) => n.id === e.source) && filteredNodes.some((n) => n.id === e.target))
    : edges;

  const handleNodeClick = (node: GraphNode) => {
    onPageSelect(node.id);
  };

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-[#86868b]">
        <Loader2 className="h-8 w-8 animate-spin opacity-50" />
        <p className="text-sm">Building knowledge graph...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-[#86868b]">
        <Network className="h-10 w-10 opacity-30" />
        <p className="text-sm text-red-500">{error}</p>
        <Button variant="outline" size="sm" onClick={loadGraph}>Retry</Button>
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-[#86868b]">
        <Network className="h-10 w-10 opacity-30" />
        <p className="text-sm">No pages yet. Create pages with [[wikilink]] to build your graph.</p>
      </div>
    );
  }

  const maxLinks = Math.max(...nodes.map((n) => n.linkCount), 1);

  return (
    <div className="relative flex h-full flex-col bg-white">
      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b border-[#e8e8ed] px-6 py-3">
        <span className="text-[15px] font-semibold text-[#1d1d1f]">Knowledge Graph</span>
        <div className="relative">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#86868b]" />
          <Input
            className="h-8 w-[180px] rounded-lg border-[#e8e8ed] pl-8 text-[12px]"
            placeholder="Search nodes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-[11px] text-[#86868b]">{filteredNodes.length} nodes, {filteredEdges.length} edges</span>
          <ToggleGroup value={[colorMode]} onValueChange={(v) => { if (v.length > 0) setColorMode(v[0] as ColorMode); }} size="sm" className="h-8">
            <ToggleGroupItem value="type" className="gap-1 px-2 text-[11px]" aria-label="Color by type">
              <Type size={13} /> Type
            </ToggleGroupItem>
            <ToggleGroupItem value="community" className="gap-1 px-2 text-[11px]" aria-label="Color by community">
              <Layers size={13} /> Community
            </ToggleGroupItem>
          </ToggleGroup>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { loadGraph(); loadInsights(); setShowInsights(!showInsights); }}
            className="h-8 gap-1 rounded-lg px-2 text-[11px]"
          >
            <Lightbulb size={13} /> Insights
          </Button>
          <Button variant="ghost" size="sm" onClick={loadGraph} className="h-8 px-2">
            <RefreshCw size={13} />
          </Button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Graph SVG */}
        <div className="relative flex-1 overflow-hidden bg-[#fafafc]">
          <svg width="100%" height="100%" viewBox="0 0 600 600" className="absolute inset-0">
            {/* Edges */}
            {filteredEdges.slice(0, 200).map((edge, i) => {
              const sp = positions.current.get(edge.source);
              const tp = positions.current.get(edge.target);
              if (!sp || !tp) return null;
              return (
                <line
                  key={`edge-${i}`}
                  x1={sp.x} y1={sp.y} x2={tp.x} y2={tp.y}
                  stroke="#d2d2d7"
                  strokeWidth={0.5 + edge.weight * 2}
                  opacity={0.6}
                />
              );
            })}
            {/* Nodes */}
            {filteredNodes.map((node) => {
              const pos = positions.current.get(node.id);
              if (!pos) return null;
              const size = 5 + (node.linkCount / maxLinks) * 12;
              const color = colorMode === "community"
                ? COMMUNITY_COLORS[(node.community ?? 0) % COMMUNITY_COLORS.length]
                : nodeColor(node.type);
              return (
                <g key={node.id} onClick={() => handleNodeClick(node)} className="cursor-pointer" style={{ cursor: "pointer" }}>
                  <circle cx={pos.x} cy={pos.y} r={size} fill={color} opacity={0.9} stroke="#fff" strokeWidth={1.5} />
                  <text x={pos.x} y={pos.y + size + 12} textAnchor="middle" fill="#6e6e73" fontSize="10" className="pointer-events-none">
                    {node.label.length > 15 ? node.label.slice(0, 15) + "…" : node.label}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Legend */}
          <div className="absolute bottom-3 left-3 rounded-lg border bg-white/90 px-3 py-2 text-xs shadow-sm">
            {colorMode === "type" ? (
              <div className="flex flex-col gap-1">
                {Object.entries(WIKI_TYPE_COLORS).map(([type, color]) => (
                  <div key={type} className="flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                    <span className="text-[11px] text-[#6e6e73]">{type}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {communities.slice(0, 6).map((c) => (
                  <div key={c.id} className="flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COMMUNITY_COLORS[c.id % COMMUNITY_COLORS.length] }} />
                    <span className="text-[11px] text-[#6e6e73]">{c.topNodes[0] ?? `Community ${c.id}`} ({c.nodeCount})</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Insights Panel */}
        {showInsights && insights && (
          <div className="w-80 shrink-0 border-l bg-white overflow-y-auto p-4">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[13px] font-semibold text-[#1d1d1f]">Graph Insights</span>
              <button onClick={() => setShowInsights(false)}><X size={14} /></button>
            </div>

            {insights.surprising?.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold">
                  <Link2 size={14} className="text-blue-500" /> Surprising Connections
                </div>
                {insights.surprising.map((conn: any, i: number) => (
                  <div key={i} className="rounded-lg border p-3 mb-2 text-sm hover:bg-[#fafafc] cursor-pointer"
                    onClick={() => { onPageSelect(conn.source.id); }}>
                    <div className="font-medium text-xs mb-1">{conn.source.label} ↔ {conn.target.label}</div>
                    <p className="text-[11px] text-[#86868b]">{conn.reasons.join(", ")}</p>
                  </div>
                ))}
              </div>
            )}

            {insights.gaps?.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold">
                  <AlertTriangle size={14} className="text-amber-500" /> Knowledge Gaps
                </div>
                {insights.gaps.map((gap: any, i: number) => (
                  <div key={i} className="rounded-lg border p-3 mb-2">
                    <div className="font-medium text-xs mb-1">{gap.title}</div>
                    <p className="text-[11px] text-[#86868b] mb-1">{gap.description}</p>
                    <p className="text-[11px] italic text-[#86868b]">{gap.suggestion}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
