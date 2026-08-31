import { useEffect, useCallback, useMemo, useRef, useState } from "react";
import Graph from "graphology";
import {
  SigmaContainer,
  useLoadGraph,
  useRegisterEvents,
  useSetSettings,
  useSigma,
} from "@react-sigma/core";
import "@react-sigma/core/lib/style.css";
import type { NodeHoverDrawingFunction } from "sigma/rendering";
import forceAtlas2 from "graphology-layout-forceatlas2";
import { AnimatePresence, m } from "motion/react";
import {
  AlertTriangle,
  Layers,
  Lightbulb,
  Link2,
  Maximize,
  Network,
  RefreshCw,
  Search,
  Type,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { GraphNode, GraphEdge, CommunityInfo } from "@feedmind/contracts";
import { getWikiGraph, getWikiGraphInsights } from "@/lib/api/wiki";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { MotionSpinner } from "@/components/ui/motion-spinner";
import { drawerVariants } from "@/lib/motion";
import { sortWikiTypes, wikiTypeColor, wikiTypeLabel, WIKI_TYPE_COLORS } from "./constants";
import { WikiReader } from "./wiki-reader";
import { useTranslation } from "react-i18next";

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

interface HoverState {
  node: string;
  neighbors: Set<string>;
}

type GraphPalette = {
  label: string;
  mutedMix: string;
  dimmedEdge: string;
  activeEdge: string;
  hoverBg: string;
  hoverBorder: string;
  hoverShadow: string;
};

const BASE_NODE_SIZE = 8;
const MAX_NODE_SIZE = 28;
const FALLBACK_COLOR = "#94a3b8";

const COMMUNITY_COLORS = [...Array(8).keys()].map((i) => `var(--wiki-community-${i})`);

// sigma 的 WebGL 着色器只认标准 CSS 颜色，而主题色是 oklch/var() 链，需借 canvas 画一像素读回 hex
let colorResolver: CanvasRenderingContext2D | null = null;
function cssColorToHex(color: string): string {
  if (!color) return FALLBACK_COLOR;
  colorResolver ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!colorResolver) return FALLBACK_COLOR;
  colorResolver.clearRect(0, 0, 1, 1);
  colorResolver.fillStyle = color;
  colorResolver.fillRect(0, 0, 1, 1);
  const { data } = colorResolver.getImageData(0, 0, 1, 1);
  return `#${Array.from(data)
    .slice(0, 3)
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`;
}

// 解析 CSS 自定义属性为实色，支持 var() 链（如 --color-editorial-primary → var(--editorial-primary)）
function cssVarToHex(varName: string): string {
  const el = document.documentElement;
  let value = getComputedStyle(el).getPropertyValue(varName).trim();
  let depth = 0;
  while (value.startsWith("var(") && depth < 8) {
    const match = /^var\((--[\w-]+)\)/.exec(value);
    if (!match) break;
    value = getComputedStyle(el)
      .getPropertyValue(match[1] ?? "")
      .trim();
    depth += 1;
  }
  return value ? cssColorToHex(value) : FALLBACK_COLOR;
}

// 监听 <html> 的 dark 类（ThemeProvider 通过类名切换），system 模式下 OS 主题变化也能响应
function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setIsDark(root.classList.contains("dark"));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return isDark;
}

function mixColor(color1: string, color2: string, ratio: number): string {
  const hex = (c: string) => parseInt(c, 16);
  const r1 = hex(color1.slice(1, 3)),
    g1 = hex(color1.slice(3, 5)),
    b1 = hex(color1.slice(5, 7));
  const r2 = hex(color2.slice(1, 3)),
    g2 = hex(color2.slice(3, 5)),
    b2 = hex(color2.slice(5, 7));
  const r = Math.round(r1 + (r2 - r1) * ratio);
  const g = Math.round(g1 + (g2 - g1) * ratio);
  const b = Math.round(b1 + (b2 - b1) * ratio);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

// 自定义 hover 标签：节点旁的圆角气泡，代替 sigma 默认的普通文本标签，读图时聚焦目标
function createHoverRenderer(palette: GraphPalette): NodeHoverDrawingFunction {
  return (context, data, settings) => {
    const label = typeof data.label === "string" ? data.label : "";
    const labelSize = settings.labelSize;
    const font = settings.labelFont;
    const weight = settings.labelWeight;
    const nodeRadius = Math.max(data.size, labelSize / 2) + 3;

    context.save();
    context.shadowOffsetX = 0;
    context.shadowOffsetY = 2;
    context.shadowBlur = 10;
    context.shadowColor = palette.hoverShadow;
    context.fillStyle = palette.hoverBg;
    context.strokeStyle = palette.hoverBorder;
    context.lineWidth = 1;

    context.beginPath();
    context.arc(data.x, data.y, nodeRadius, 0, Math.PI * 2);
    context.closePath();
    context.fill();
    context.stroke();

    if (label) {
      context.font = `${weight} ${labelSize}px ${font}`;
      const paddingX = 8;
      const paddingY = 4;
      const gap = 6;
      const textWidth = context.measureText(label).width;
      const boxWidth = Math.ceil(textWidth + paddingX * 2);
      const boxHeight = Math.ceil(labelSize + paddingY * 2);
      const boxX = data.x + nodeRadius + gap;
      const boxY = data.y - boxHeight / 2;

      drawRoundedRect(context, boxX, boxY, boxWidth, boxHeight, 5);
      context.fill();
      context.stroke();

      context.shadowBlur = 0;
      context.shadowOffsetY = 0;
      context.fillStyle = palette.label;
      context.fillText(label, boxX + paddingX, data.y + labelSize / 3);
    }

    context.restore();
  };
}

// 节点越多标签越稀疏、越不显示小标签，避免大图糊成一团
function labelDensity(nodeCount: number): number {
  if (nodeCount > 2500) return 0.08;
  if (nodeCount > 1200) return 0.14;
  if (nodeCount > 600) return 0.24;
  return 0.4;
}

function labelSizeThreshold(nodeCount: number): number {
  if (nodeCount > 2500) return 18;
  if (nodeCount > 1200) return 14;
  if (nodeCount > 600) return 10;
  return 6;
}

// ForceAtlas2 迭代次数随图规模递减，大图少迭代以免布局卡顿
function layoutIterations(nodeCount: number): number {
  if (nodeCount > 2500) return 28;
  if (nodeCount > 1200) return 40;
  if (nodeCount > 600) return 65;
  if (nodeCount > 250) return 90;
  return 140;
}

// 节点大小按链接数平方根缩放：hub 大、叶子小
function nodeSize(linkCount: number, maxLinks: number): number {
  if (maxLinks === 0) return BASE_NODE_SIZE;
  const ratio = linkCount / maxLinks;
  return BASE_NODE_SIZE + Math.sqrt(ratio) * (MAX_NODE_SIZE - BASE_NODE_SIZE);
}

function graphDataKey(nodes: readonly GraphNode[], edges: readonly GraphEdge[]): string {
  const nodeIds = nodes.map((n) => n.id).sort();
  const edgeIds = edges.map((e) => `${e.source}->${e.target}`).sort();
  return `${hashParts(nodeIds)}:${hashParts(edgeIds)}:${nodes.length}:${edges.length}`;
}

function hashParts(parts: readonly string[]): string {
  let hash = 2166136261;
  for (const part of parts) {
    for (let i = 0; i < part.length; i++) {
      hash ^= part.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    hash ^= 0xff;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function GraphLoader({
  nodes,
  edges,
  colorMode,
  typeColors,
  communityColors,
  positionCache,
  lastLayoutDataKeyRef,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  colorMode: ColorMode;
  typeColors: Record<string, string>;
  communityColors: string[];
  positionCache: Map<string, { x: number; y: number }>;
  lastLayoutDataKeyRef: { current: string };
}) {
  const loadGraph = useLoadGraph();
  const sigma = useSigma();

  useEffect(() => {
    const dataKey = graphDataKey(nodes, edges);
    const needsLayout = dataKey !== lastLayoutDataKeyRef.current;
    const graph = new Graph();
    const maxLinks = Math.max(...nodes.map((n) => n.linkCount), 1);

    for (const node of nodes) {
      const cached = positionCache.get(node.id);
      const color =
        colorMode === "community"
          ? communityColors[(node.community ?? 0) % communityColors.length]
          : (typeColors[node.type.toLowerCase()] ?? typeColors[node.type] ?? FALLBACK_COLOR);
      graph.addNode(node.id, {
        type: "circle",
        x: cached?.x ?? Math.random() * 100,
        y: cached?.y ?? Math.random() * 100,
        size: nodeSize(node.linkCount, maxLinks),
        color,
        label: node.label,
      });
    }

    for (const edge of edges) {
      if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) continue;
      const edgeKey = `${edge.source}->${edge.target}`;
      if (graph.hasEdge(edgeKey) || graph.hasEdge(`${edge.target}->${edge.source}`)) continue;
      // weight 目前恒为 1，粗细差异留给未来加语义权重后生效
      graph.addEdgeWithKey(edgeKey, edge.source, edge.target, {
        size: 0.5 + edge.weight * 3.5,
        sourceNode: edge.source,
        targetNode: edge.target,
      });
    }

    if (needsLayout && nodes.length > 1) {
      const settings = forceAtlas2.inferSettings(graph);
      forceAtlas2.assign(graph, {
        iterations: layoutIterations(nodes.length),
        settings: {
          ...settings,
          gravity: 1,
          scalingRatio: nodes.length > 400 ? 3 : 2,
          strongGravityMode: true,
          barnesHutOptimize: nodes.length > 50,
        },
      });
      graph.forEachNode((id, attrs) => {
        positionCache.set(id, { x: attrs["x"], y: attrs["y"] });
      });
      lastLayoutDataKeyRef.current = dataKey;
    }

    loadGraph(graph);
    sigma.refresh();
  }, [
    loadGraph,
    sigma,
    nodes,
    edges,
    colorMode,
    typeColors,
    communityColors,
    positionCache,
    lastLayoutDataKeyRef,
  ]);

  return null;
}

function GraphRenderSettings({
  hoverState,
  nodeCount,
  palette,
}: {
  hoverState: HoverState | null;
  nodeCount: number;
  palette: GraphPalette;
}) {
  const sigma = useSigma();
  const setSettings = useSetSettings();
  const hoverRenderer = useMemo(() => createHoverRenderer(palette), [palette]);

  useEffect(() => {
    setSettings({
      hideEdgesOnMove: true,
      hideLabelsOnMove: true,
      labelColor: { color: palette.label },
      labelDensity: labelDensity(nodeCount),
      labelRenderedSizeThreshold: labelSizeThreshold(nodeCount),
      renderEdgeLabels: false,
      defaultDrawNodeHover: hoverRenderer,
      nodeReducer: (node, attrs) => {
        const result = { ...attrs };
        const hasHover = hoverState !== null;
        const isHoverNode = hoverState?.node === node;
        const isHoverNeighbor = hoverState?.neighbors.has(node) ?? false;
        if (isHoverNode) {
          result.size = (attrs.size ?? BASE_NODE_SIZE) * 1.4;
          result.zIndex = 10;
          result.forceLabel = true;
        }
        if (hasHover && !isHoverNode && !isHoverNeighbor) {
          result.color = mixColor(attrs.color ?? FALLBACK_COLOR, palette.mutedMix, 0.75);
          result.label = "";
          result.size = (attrs.size ?? BASE_NODE_SIZE) * 0.6;
        }
        return result;
      },
      edgeReducer: (_edge, attrs) => {
        const result = { ...attrs };
        const source = String(attrs.sourceNode ?? "");
        const target = String(attrs.targetNode ?? "");
        const hasHover = hoverState !== null;
        const hoverEdge = hasHover && (source === hoverState?.node || target === hoverState?.node);
        if (hasHover && !hoverEdge) {
          result.color = palette.dimmedEdge;
          result.size = 0.3;
        }
        if (hoverEdge) {
          result.color = palette.activeEdge;
          result.size = Math.max(2, (attrs.size ?? 1) * 1.5);
        }
        return result;
      },
    });
    sigma.refresh();
  }, [setSettings, sigma, hoverState, nodeCount, palette, hoverRenderer]);

  return null;
}

function EventHandler({
  onNodeClick,
  onHoverChange,
}: {
  onNodeClick: (nodeId: string) => void;
  onHoverChange: (state: HoverState | null) => void;
}) {
  const registerEvents = useRegisterEvents();
  const sigma = useSigma();

  useEffect(() => {
    registerEvents({
      clickNode: ({ node }) => onNodeClick(node),
      enterNode: ({ node }) => {
        sigma.getContainer().style.cursor = "pointer";
        const graph = sigma.getGraph();
        onHoverChange({ node, neighbors: new Set(graph.neighbors(node)) });
      },
      leaveNode: () => {
        sigma.getContainer().style.cursor = "default";
        onHoverChange(null);
      },
    });
  }, [registerEvents, sigma, onNodeClick, onHoverChange]);

  return null;
}

function ZoomControls() {
  const sigma = useSigma();
  const { t } = useTranslation();
  return (
    <div className="absolute right-3 top-3 flex flex-col gap-1">
      <Button
        variant="outline"
        size="icon"
        className="h-7 w-7 bg-editorial-surface-card/80 backdrop-blur-sm"
        onClick={() => void sigma.getCamera().animatedZoom({ duration: 200 })}
        aria-label={t("common.zoomIn")}
      >
        <ZoomIn className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        className="h-7 w-7 bg-editorial-surface-card/80 backdrop-blur-sm"
        onClick={() => void sigma.getCamera().animatedUnzoom({ duration: 200 })}
        aria-label={t("common.zoomOut")}
      >
        <ZoomOut className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        className="h-7 w-7 bg-editorial-surface-card/80 backdrop-blur-sm"
        onClick={() => void sigma.getCamera().animatedReset({ duration: 300 })}
        aria-label={t("common.zoomReset")}
      >
        <Maximize className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

type ColorMode = "type" | "community";

interface WikiGraphViewProps {
  spaceId: string;
  onPageSelect: (pageId: string) => void;
  onNavigate: (target: string) => Promise<string | null>;
}

export function WikiGraphView({ spaceId, onPageSelect, onNavigate }: WikiGraphViewProps) {
  const { t, i18n } = useTranslation();
  const isDark = useIsDark();

  // 将主题 CSS 变量解析为 hex 供 sigma 使用；主题切换时重算
  const typeColors = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [type, raw] of Object.entries(WIKI_TYPE_COLORS)) {
      const match = /^var\((--[\w-]+)\)$/.exec(raw);
      out[type] = match ? cssVarToHex(match[1] ?? "") : cssColorToHex(raw);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 依赖 isDark 让主题切换时重解析
  }, [isDark]);

  const communityColors = useMemo(
    () => COMMUNITY_COLORS.map((_, i) => cssVarToHex(`--wiki-community-${i}`)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 同上
    [isDark],
  );

  const palette = useMemo<GraphPalette>(
    () => ({
      label: cssVarToHex("--editorial-ink"),
      mutedMix: cssVarToHex("--editorial-surface-strong"),
      dimmedEdge: cssVarToHex("--editorial-hairline"),
      activeEdge: isDark ? "#7aaef7" : "#37352d",
      hoverBg: cssVarToHex("--editorial-surface-card"),
      hoverBorder: cssVarToHex("--editorial-hairline-strong"),
      hoverShadow: isDark ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.18)",
    }),
    [isDark],
  );

  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [communities, setCommunities] = useState<CommunityInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [colorMode, setColorMode] = useState<ColorMode>("type");
  const [searchQuery, setSearchQuery] = useState("");
  const [insights, setInsights] = useState<GraphInsights | null>(null);
  const [showInsights, setShowInsights] = useState(false);
  const [hoverState, setHoverState] = useState<HoverState | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [sigmaKey, setSigmaKey] = useState(0);

  // 布局坐标缓存：随组件实例生命周期，切空间时清空，避免跨空间复用节点旧坐标
  const positionCacheRef = useRef(new Map<string, { x: number; y: number }>());
  const lastLayoutDataKeyRef = useRef("");
  useEffect(() => {
    positionCacheRef.current.clear();
    lastLayoutDataKeyRef.current = "";
  }, [spaceId]);

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
      /* 洞察加载失败不阻塞图谱展示 */
    }
  }, [spaceId]);

  useEffect(() => {
    void loadGraph();
  }, [loadGraph]);

  // 侧栏开合改变容器尺寸，sigma 的 WebGL 画布 resize 会崩溃，需重挂载
  const layoutKey = `${showInsights}-${!!selectedNodeId}`;
  const prevLayoutKey = useRef(layoutKey);
  useEffect(() => {
    if (prevLayoutKey.current === layoutKey) return;
    prevLayoutKey.current = layoutKey;
    const timer = setTimeout(() => setSigmaKey((k) => k + 1), 100);
    return () => clearTimeout(timer);
  }, [layoutKey]);

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

  const handleNodeClick = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;
      onPageSelect(node.id);
      setSelectedNodeId(node.id);
    },
    [nodes, onPageSelect],
  );

  const handlePanelNavigate = async (target: string) => {
    const pageId = await onNavigate(target);
    if (pageId) setSelectedNodeId(pageId);
  };

  if (loading) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-editorial-ink-muted">
        <MotionSpinner size={32} className="opacity-50" />
        <p className="text-sm">{t("wiki.graphLoading")}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-editorial-ink-muted">
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
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-editorial-ink-muted">
        <Network className="h-10 w-10 opacity-30" />
        <p className="text-sm">{t("wiki.graphEmpty")}</p>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-w-0 flex-1 flex-col bg-editorial-surface-card">
      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b border-editorial-surface-strong px-6 py-3">
        <span className="text-sm font-semibold text-editorial-ink">{t("wiki.graph")}</span>
        <div className="relative">
          <Search
            size={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-editorial-ink-muted"
          />
          <Input
            aria-label={t("wiki.searchNodes")}
            className="h-8 w-[180px] rounded-lg border-editorial-surface-strong pl-8 text-xs"
            placeholder={t("wiki.searchNodes")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-xs text-editorial-ink-muted">
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
              className="gap-1 px-2 text-xs"
              aria-label={t("wiki.colorByType")}
            >
              <Type size={13} /> {t("wiki.type")}
            </ToggleGroupItem>
            <ToggleGroupItem
              value="community"
              className="gap-1 px-2 text-xs"
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
            className="h-8 gap-1 rounded-lg px-2 text-xs"
          >
            <Lightbulb size={13} /> {t("wiki.insights")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void loadGraph()} className="h-8 px-2">
            <RefreshCw size={13} />
          </Button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Graph canvas */}
        <div className="relative flex-1 overflow-hidden bg-editorial-canvas-soft">
          <SigmaContainer
            key={sigmaKey}
            style={{ width: "100%", height: "100%", background: "transparent" }}
            settings={{
              allowInvalidContainer: true,
              defaultNodeType: "circle",
              renderEdgeLabels: false,
              hideEdgesOnMove: true,
              hideLabelsOnMove: true,
              labelSize: 13,
              labelWeight: "bold",
              stagePadding: 30,
            }}
          >
            <GraphLoader
              nodes={filteredNodes}
              edges={filteredEdges}
              colorMode={colorMode}
              typeColors={typeColors}
              communityColors={communityColors}
              positionCache={positionCacheRef.current}
              lastLayoutDataKeyRef={lastLayoutDataKeyRef}
            />
            <EventHandler onNodeClick={handleNodeClick} onHoverChange={setHoverState} />
            <GraphRenderSettings
              hoverState={hoverState}
              nodeCount={filteredNodes.length}
              palette={palette}
            />
            <ZoomControls />
          </SigmaContainer>

          {/* Legend */}
          <div className="absolute bottom-3 left-3 rounded-lg border border-editorial-hairline bg-editorial-surface-card/95 px-3 py-2 text-xs">
            {colorMode === "type" ? (
              <div className="flex flex-col gap-1">
                {sortWikiTypes([...new Set(nodes.map((node) => node.type))]).map((type) => (
                  <div key={type} className="flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: wikiTypeColor(type) }}
                    />
                    <span className="text-xs text-editorial-ink-soft">
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
                    <span className="text-xs text-editorial-ink-soft">
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
            <m.div
              className="w-80 shrink-0 border-l border-editorial-hairline bg-editorial-surface-card overflow-y-auto p-4 shadow-[-2px_0_4px_rgba(0,0,0,0.03)]"
              key="insights"
              variants={drawerVariants}
              initial="closed"
              animate="open"
              exit="closed"
            >
              <div className="flex items-center justify-between mb-4">
                <span className="text-body font-semibold text-editorial-ink">
                  {t("wiki.insightsTitle")}
                </span>
                <button
                  type="button"
                  onClick={() => setShowInsights(false)}
                  aria-label={t("common.close")}
                >
                  <X size={14} />
                </button>
              </div>

              {insights.surprising?.length > 0 && (
                <div className="mb-4">
                  <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold">
                    <Link2 size={14} className="text-blue-500" /> {t("wiki.unexpectedLinks")}
                  </div>
                  {insights.surprising.map((conn) => (
                    <div
                      key={`${conn.source.id}:${conn.target.id}`}
                      role="button"
                      tabIndex={0}
                      className="rounded-lg border p-3 mb-2 text-sm hover:bg-editorial-canvas-soft cursor-pointer"
                      onClick={() => {
                        onPageSelect(conn.source.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onPageSelect(conn.source.id);
                        }
                      }}
                    >
                      <div className="font-medium text-xs mb-1">
                        {conn.source.label} ↔ {conn.target.label}
                      </div>
                      <p className="text-xs text-editorial-ink-muted">{conn.reasons.join(", ")}</p>
                    </div>
                  ))}
                </div>
              )}

              {insights.gaps?.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold">
                    <AlertTriangle size={14} className="text-amber-500" /> {t("wiki.knowledgeGaps")}
                  </div>
                  {insights.gaps.map((gap) => (
                    <div key={gap.title} className="rounded-lg border p-3 mb-2">
                      <div className="font-medium text-xs mb-1">{gap.title}</div>
                      <p className="text-xs text-editorial-ink-muted mb-1">{gap.description}</p>
                      <p className="text-xs italic text-editorial-ink-muted">{gap.suggestion}</p>
                    </div>
                  ))}
                </div>
              )}
            </m.div>
          )}
        </AnimatePresence>

        <AnimatePresence initial={false}>
          {selectedNodeId && (
            <m.aside
              className="flex w-[min(560px,45vw)] shrink-0 flex-col border-l border-editorial-hairline bg-editorial-surface-card shadow-[-2px_0_4px_rgba(0,0,0,0.03)]"
              key={`preview-${selectedNodeId}`}
              variants={drawerVariants}
              initial="closed"
              animate="open"
              exit="closed"
            >
              <div className="flex h-12 shrink-0 items-center justify-between border-b border-editorial-hairline px-4">
                <span className="text-body font-medium text-editorial-ink">页面预览</span>
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
            </m.aside>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
