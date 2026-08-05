"use client";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Network,
  RefreshCw,
  Search,
  Type,
  Layers,
  Lightbulb,
  AlertTriangle,
  Link2,
  X,
} from "lucide-react";
import type { GraphNode, GraphEdge, CommunityInfo } from "@feedmind/contracts";

interface SurprisingConnection {
  source: { id: string; label: string; type: string };
  target: { id: string; label: string; type: string };
  score: number;
  reasons: string[];
  key: string;
}

interface KnowledgeGap {
  type: string;
  title: string;
  description: string;
  nodeIds: string[];
  suggestion: string;
}

interface GraphInsights {
  surprising: SurprisingConnection[];
  gaps: KnowledgeGap[];
  nodeCount: number;
  edgeCount: number;
}
import { getWikiGraph, getWikiGraphInsights } from "@/lib/api/wiki";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { MotionSpinner } from "@/components/ui/motion-spinner";
import { drawerVariants } from "@/lib/motion";
import { sortWikiTypes, wikiTypeColor, wikiTypeLabel } from "./constants";
import { WikiReader } from "./wiki-reader";
import { useTranslation } from "react-i18next";

interface WikiGraphViewProps {
  spaceId: string;
  onPageSelect: (pageId: string) => void;
  onNavigate: (target: string) => Promise<string | null>;
}

type ColorMode = "type" | "community";

const COMMUNITY_COLORS = [
  "var(--wiki-community-0)",
  "var(--wiki-community-1)",
  "var(--wiki-community-2)",
  "var(--wiki-community-3)",
  "var(--wiki-community-4)",
  "var(--wiki-community-5)",
  "var(--wiki-community-6)",
  "var(--wiki-community-7)",
];

function nodeColor(type: string): string {
  return wikiTypeColor(type);
}

export function WikiGraphView({ spaceId, onPageSelect, onNavigate }: WikiGraphViewProps) {
  const { t, i18n } = useTranslation();
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [communities, setCommunities] = useState<CommunityInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [colorMode, setColorMode] = useState<ColorMode>("type");
  const [searchQuery, setSearchQuery] = useState("");
  const [insights, setInsights] = useState<GraphInsights | null>(null);
  const [showInsights, setShowInsights] = useState(false);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 1 });
  const dragRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);

  const loadGraph = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const graph = await getWikiGraph(spaceId);
      setNodes(graph.nodes);
      setEdges(graph.edges);
      setCommunities(graph.communities);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("wiki.graphLoadFailed"));
    } finally {
      setLoading(false);
    }
  }, [spaceId, t]);

  const loadInsights = useCallback(async () => {
    try {
      const data = await getWikiGraphInsights(spaceId);
      setInsights(data);
    } catch {
      /* ignore */
    }
  }, [spaceId]);

  useEffect(() => {
    void loadGraph();
  }, [loadGraph]);

  const positions = useMemo(() => {
    const pos = new Map<string, { x: number; y: number }>();
    const n = nodes.length;
    const radius = Math.max(140, Math.min(235, n * 12));
    for (let i = 0; i < n; i++) {
      const angle = (2 * Math.PI * i) / n;
      pos.set(nodes[i].id, {
        x: 300 + radius * Math.cos(angle),
        y: 300 + radius * Math.sin(angle),
      });
    }
    return pos;
  }, [nodes]);

  const filteredNodes = searchQuery
    ? nodes.filter((n) => n.label.toLowerCase().includes(searchQuery.toLowerCase()))
    : nodes;

  const filteredEdges = searchQuery
    ? edges.filter(
        (e) =>
          filteredNodes.some((n) => n.id === e.source) &&
          filteredNodes.some((n) => n.id === e.target),
      )
    : edges;

  const highlightedNodeIds = useMemo(() => {
    if (!hoveredNodeId) return null;
    const ids = new Set([hoveredNodeId]);
    for (const edge of filteredEdges) {
      if (edge.source === hoveredNodeId) ids.add(edge.target);
      if (edge.target === hoveredNodeId) ids.add(edge.source);
    }
    return ids;
  }, [filteredEdges, hoveredNodeId]);

  const handleNodeClick = (node: GraphNode) => {
    onPageSelect(node.id);
    setSelectedNodeId(node.id);
  };

  const handlePanelNavigate = async (target: string) => {
    const pageId = await onNavigate(target);
    if (pageId) setSelectedNodeId(pageId);
  };

  const handleWheel = (event: React.WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    setViewport((current) => ({
      ...current,
      scale: Math.min(2.5, Math.max(0.5, current.scale * (event.deltaY < 0 ? 1.1 : 0.9))),
    }));
  };

  const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if ((event.target as Element).closest("[data-graph-node]")) return;
    dragRef.current = {
      x: viewport.x,
      y: viewport.y,
      startX: event.clientX,
      startY: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    setViewport((current) => ({
      ...current,
      x: drag.x + ((event.clientX - drag.startX) * 600) / bounds.width,
      y: drag.y + ((event.clientY - drag.startY) * 600) / bounds.height,
    }));
  };

  const handlePointerEnd = () => {
    dragRef.current = null;
  };

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-editorial-ink-muted">
        <MotionSpinner size={32} className="opacity-50" />
        <p className="text-sm">{t("wiki.graphLoading")}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-editorial-ink-muted">
        <Network className="h-10 w-10 opacity-30" />
        <p className="text-sm text-editorial-semantic-error">{error}</p>
        <Button variant="outline" size="sm" onClick={() => void loadGraph()}>
          {t("common.retry")}
        </Button>
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-editorial-ink-muted">
        <Network className="h-10 w-10 opacity-30" />
        <p className="text-sm">{t("wiki.graphEmpty")}</p>
      </div>
    );
  }

  const maxLinks = Math.max(...nodes.map((n) => n.linkCount), 1);

  return (
    <div className="relative flex h-full min-w-0 flex-1 flex-col bg-editorial-surface-card">
      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b border-editorial-surface-strong px-6 py-3">
        <span className="text-[14px] font-semibold text-editorial-ink">{t("wiki.graph")}</span>
        <div className="relative">
          <Search
            size={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-editorial-ink-muted"
          />
          <Input
            aria-label={t("wiki.searchNodes")}
            className="h-8 w-[180px] rounded-lg border-editorial-surface-strong pl-8 text-[12px]"
            placeholder={t("wiki.searchNodes")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-[12px] text-editorial-ink-muted">
            {t("wiki.nodeEdgeCount", { nodes: filteredNodes.length, edges: filteredEdges.length })}
          </span>
          <ToggleGroup
            value={[colorMode]}
            onValueChange={(v) => {
              if (v.length > 0) setColorMode(v[0] as ColorMode);
            }}
            size="sm"
            className="h-8"
          >
            <ToggleGroupItem
              value="type"
              className="gap-1 px-2 text-[12px]"
              aria-label={t("wiki.colorByType")}
            >
              <Type size={13} /> {t("wiki.type")}
            </ToggleGroupItem>
            <ToggleGroupItem
              value="community"
              className="gap-1 px-2 text-[12px]"
              aria-label={t("wiki.colorByCommunity")}
            >
              <Layers size={13} /> {t("wiki.community")}
            </ToggleGroupItem>
          </ToggleGroup>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void loadGraph();
              void loadInsights();
              setShowInsights(!showInsights);
            }}
            className="h-8 gap-1 rounded-lg px-2 text-[12px]"
          >
            <Lightbulb size={13} /> {t("wiki.insights")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void loadGraph()} className="h-8 px-2">
            <RefreshCw size={13} />
          </Button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Graph SVG */}
        <div className="relative flex-1 overflow-hidden bg-editorial-canvas-soft">
          <svg
            width="100%"
            height="100%"
            viewBox="0 0 600 600"
            className="absolute inset-0 touch-none select-none cursor-grab active:cursor-grabbing"
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
          >
            <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.scale})`}>
              {/* Edges */}
              {filteredEdges.slice(0, 200).map((edge, i) => {
                const sp = positions.get(edge.source);
                const tp = positions.get(edge.target);
                if (!sp || !tp) return null;
                const isConnected = hoveredNodeId === edge.source || hoveredNodeId === edge.target;
                return (
                  <motion.line
                    key={`edge-${i}`}
                    initial={false}
                    x1={sp.x}
                    y1={sp.y}
                    x2={tp.x}
                    y2={tp.y}
                    stroke={isConnected ? "#7aaef7" : "#c9d9ef"}
                    strokeWidth={isConnected ? 1.8 : 0.65 + Math.min(edge.weight, 8) * 0.14}
                    opacity={hoveredNodeId ? (isConnected ? 0.95 : 0.08) : 0.5}
                    animate={{
                      opacity: hoveredNodeId ? (isConnected ? 0.95 : 0.08) : 0.5,
                      strokeWidth: isConnected ? 1.8 : 0.65 + Math.min(edge.weight, 8) * 0.14,
                    }}
                    transition={{ duration: 0.18 }}
                  />
                );
              })}
              {/* Nodes */}
              {filteredNodes.map((node) => {
                const pos = positions.get(node.id);
                if (!pos) return null;
                const size = 6 + (node.linkCount / maxLinks) * 10;
                const isHovered = node.id === hoveredNodeId;
                const isHighlighted = highlightedNodeIds?.has(node.id) ?? true;
                const color =
                  colorMode === "community"
                    ? COMMUNITY_COLORS[(node.community ?? 0) % COMMUNITY_COLORS.length]
                    : nodeColor(node.type);
                return (
                  <motion.g
                    key={node.id}
                    initial={false}
                    data-graph-node
                    onClick={() => handleNodeClick(node)}
                    onMouseEnter={() => setHoveredNodeId(node.id)}
                    onMouseLeave={() => setHoveredNodeId(null)}
                    onFocus={() => setHoveredNodeId(node.id)}
                    onBlur={() => setHoveredNodeId(null)}
                    onKeyDown={(event: KeyboardEvent<SVGGElement>) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        handleNodeClick(node);
                      }
                    }}
                    className="cursor-pointer"
                    style={{ cursor: "pointer" }}
                    animate={{ opacity: isHighlighted ? 1 : 0.2 }}
                    whileHover={{ scale: 1.04 }}
                    transition={{ duration: 0.18 }}
                    role="button"
                    tabIndex={0}
                    aria-label={node.label}
                  >
                    <title>{node.label}</title>
                    <motion.circle
                      initial={false}
                      cx={pos.x}
                      cy={pos.y}
                      r={size}
                      style={{ fill: color }}
                      animate={{
                        r: isHovered ? size + 1 : size,
                        opacity: isHighlighted ? 0.95 : 0.16,
                        strokeWidth: isHovered ? 2.5 : 1.5,
                      }}
                      stroke="var(--editorial-surface-card)"
                      strokeWidth={isHovered ? 2.5 : 1.5}
                    />
                    <motion.text
                      initial={false}
                      x={pos.x}
                      y={pos.y + size + 12}
                      textAnchor="middle"
                      fill="var(--editorial-ink-soft)"
                      fontSize="10"
                      fontWeight={isHovered ? 600 : 500}
                      animate={{ opacity: isHighlighted ? 1 : 0.2 }}
                      className="pointer-events-none"
                    >
                      {node.label.length > 15 ? node.label.slice(0, 15) + "…" : node.label}
                    </motion.text>
                  </motion.g>
                );
              })}
            </g>
          </svg>

          {/* Legend */}
          <div className="absolute bottom-3 left-3 rounded-lg border border-editorial-hairline bg-editorial-surface-card/95 px-3 py-2 text-xs">
            {colorMode === "type" ? (
              <div className="flex flex-col gap-1">
                {sortWikiTypes([...new Set(nodes.map((node) => node.type))]).map((type) => (
                  <div key={type} className="flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: nodeColor(type) }}
                    />
                    <span className="text-[12px] text-editorial-ink-soft">
                      {wikiTypeLabel(type, i18n.language)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {communities.slice(0, 6).map((c) => (
                  <div key={c.id} className="flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: COMMUNITY_COLORS[c.id % COMMUNITY_COLORS.length] }}
                    />
                    <span className="text-[12px] text-editorial-ink-soft">
                      {c.topNodes[0] ?? `${t("wiki.community")} ${c.id}`} ({c.nodeCount})
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Insights Panel */}
        <AnimatePresence initial={false}>
          {showInsights && insights && (
            <motion.div
              className="w-80 shrink-0 border-l border-editorial-hairline bg-editorial-surface-card overflow-y-auto p-4 shadow-[-2px_0_4px_rgba(0,0,0,0.03)]"
              key="insights"
              variants={drawerVariants}
              initial="closed"
              animate="open"
              exit="closed"
            >
              <div className="flex items-center justify-between mb-4">
                <span className="text-[13px] font-semibold text-editorial-ink">
                  {t("wiki.insightsTitle")}
                </span>
                <button onClick={() => setShowInsights(false)}>
                  <X size={14} />
                </button>
              </div>

              {insights.surprising?.length > 0 && (
                <div className="mb-4">
                  <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold">
                    <Link2 size={14} className="text-blue-500" /> {t("wiki.unexpectedLinks")}
                  </div>
                  {insights.surprising.map((conn, i: number) => (
                    <div
                      key={i}
                      className="rounded-lg border p-3 mb-2 text-sm hover:bg-editorial-canvas-soft cursor-pointer"
                      onClick={() => {
                        onPageSelect(conn.source.id);
                      }}
                    >
                      <div className="font-medium text-xs mb-1">
                        {conn.source.label} ↔ {conn.target.label}
                      </div>
                      <p className="text-[12px] text-editorial-ink-muted">
                        {conn.reasons.join(", ")}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {insights.gaps?.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold">
                    <AlertTriangle size={14} className="text-amber-500" /> {t("wiki.knowledgeGaps")}
                  </div>
                  {insights.gaps.map((gap, i: number) => (
                    <div key={i} className="rounded-lg border p-3 mb-2">
                      <div className="font-medium text-xs mb-1">{gap.title}</div>
                      <p className="text-[12px] text-editorial-ink-muted mb-1">{gap.description}</p>
                      <p className="text-[12px] italic text-editorial-ink-muted">
                        {gap.suggestion}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence initial={false}>
          {selectedNodeId && (
            <motion.aside
              className="flex w-[min(560px,45vw)] shrink-0 flex-col border-l border-editorial-hairline bg-editorial-surface-card shadow-[-2px_0_4px_rgba(0,0,0,0.03)]"
              key={`preview-${selectedNodeId}`}
              variants={drawerVariants}
              initial="closed"
              animate="open"
              exit="closed"
            >
              <div className="flex h-12 shrink-0 items-center justify-between border-b border-editorial-hairline px-4">
                <span className="text-[13px] font-medium text-editorial-ink">页面预览</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 rounded-lg"
                  onClick={() => setSelectedNodeId(null)}
                  aria-label="关闭页面预览"
                >
                  <X size={15} />
                </Button>
              </div>
              <div className="min-h-0 flex-1">
                <WikiReader
                  spaceId={spaceId}
                  pageId={selectedNodeId}
                  onNavigate={(target) => void handlePanelNavigate(target)}
                />
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
