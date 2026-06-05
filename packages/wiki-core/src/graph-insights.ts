import type { GraphNode, GraphEdge, CommunityInfo } from "@feedmind/contracts";

export interface SurprisingConnection {
  source: GraphNode;
  target: GraphNode;
  score: number;
  reasons: string[];
  key: string;
}

export interface KnowledgeGap {
  type: "isolated-node" | "sparse-community" | "bridge-node";
  title: string;
  description: string;
  nodeIds: string[];
  suggestion: string;
}

/**
 * Find connections that cross community boundaries or type boundaries.
 */
export function findSurprisingConnections(
  nodes: GraphNode[],
  edges: GraphEdge[],
  _communities: CommunityInfo[],
  limit: number = 5,
): SurprisingConnection[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const degreeMap = new Map(nodes.map((n) => [n.id, n.linkCount]));
  const maxDegree = Math.max(...nodes.map((n) => n.linkCount), 1);
  const STRUCTURAL_IDS = new Set(["index", "log", "overview"]);

  const scored: SurprisingConnection[] = [];

  for (const edge of edges) {
    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);
    if (!source || !target) continue;
    if (STRUCTURAL_IDS.has(source.id) || STRUCTURAL_IDS.has(target.id)) continue;

    let score = 0;
    const reasons: string[] = [];

    if ((source.community ?? 0) !== (target.community ?? 0)) {
      score += 3;
      reasons.push("crosses community boundary");
    }

    if (source.type !== target.type) {
      const distantPairs = new Set([
        "source-concept", "concept-source",
      ]);
      const pair = `${source.type}-${target.type}`;
      if (distantPairs.has(pair)) {
        score += 2;
        reasons.push(`connects ${source.type} to ${target.type}`);
      } else {
        score += 1;
        reasons.push("different types");
      }
    }

    const sourceDeg = degreeMap.get(source.id) ?? 0;
    const targetDeg = degreeMap.get(target.id) ?? 0;
    const minDeg = Math.min(sourceDeg, targetDeg);
    if (minDeg <= 2 && Math.max(sourceDeg, targetDeg) >= maxDegree * 0.5) {
      score += 2;
      reasons.push("peripheral node links to hub");
    }

    if (score >= 3 && reasons.length > 0) {
      const key = [source.id, target.id].sort().join(":::");
      scored.push({ source, target, score, reasons, key });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

/**
 * Detect knowledge gaps based on graph structure.
 */
export function detectKnowledgeGaps(
  nodes: GraphNode[],
  edges: GraphEdge[],
  communities: CommunityInfo[],
  limit: number = 8,
): KnowledgeGap[] {
  const gaps: KnowledgeGap[] = [];

  // 1. Isolated nodes
  const isolatedNodes = nodes.filter(
    (n) => n.linkCount <= 1 && n.type !== "overview" && n.id !== "index" && n.id !== "log",
  );
  if (isolatedNodes.length > 0) {
    const topIsolated = isolatedNodes.slice(0, 5);
    gaps.push({
      type: "isolated-node",
      title: `${isolatedNodes.length} isolated page${isolatedNodes.length > 1 ? "s" : ""}`,
      description: topIsolated.map((n) => n.label).join(", ") +
        (isolatedNodes.length > 5 ? ` and ${isolatedNodes.length - 5} more` : ""),
      nodeIds: isolatedNodes.map((n) => n.id),
      suggestion: "Add [[wikilinks]] to related pages, or expand their content.",
    });
  }

  // 2. Sparse communities
  for (const comm of communities) {
    if (comm.cohesion < 0.15 && comm.nodeCount >= 3) {
      gaps.push({
        type: "sparse-community",
        title: `Sparse cluster: ${comm.topNodes[0] ?? `Community ${comm.id}`}`,
        description: `${comm.nodeCount} pages with cohesion ${comm.cohesion.toFixed(2)} — weak internal connections.`,
        nodeIds: nodes.filter((n) => (n.community ?? 0) === comm.id).map((n) => n.id),
        suggestion: "Add cross-references between these pages.",
      });
    }
  }

  // 3. Bridge nodes (connected to multiple communities)
  const communityNeighbors = new Map<string, Set<number>>();
  for (const node of nodes) communityNeighbors.set(node.id, new Set());
  for (const edge of edges) {
    const sourceNode = nodes.find((n) => n.id === edge.source);
    const targetNode = nodes.find((n) => n.id === edge.target);
    if (sourceNode && targetNode) {
      communityNeighbors.get(edge.source)?.add(targetNode.community ?? 0);
      communityNeighbors.get(edge.target)?.add(sourceNode.community ?? 0);
    }
  }

  const STRUCTURAL_IDS = new Set(["index", "log", "overview"]);
  const bridgeNodes = nodes
    .filter((n) => {
      if (STRUCTURAL_IDS.has(n.id)) return false;
      const neighborComms = communityNeighbors.get(n.id);
      return neighborComms && neighborComms.size >= 3;
    })
    .sort((a, b) => {
      const aComms = communityNeighbors.get(a.id)?.size ?? 0;
      const bComms = communityNeighbors.get(b.id)?.size ?? 0;
      return bComms - aComms;
    })
    .slice(0, 3);

  for (const bridge of bridgeNodes) {
    const commCount = communityNeighbors.get(bridge.id)?.size ?? 0;
    gaps.push({
      type: "bridge-node",
      title: `Key bridge: ${bridge.label}`,
      description: `Connects ${commCount} different knowledge clusters.`,
      nodeIds: [bridge.id],
      suggestion: "Ensure this bridging page is well-maintained.",
    });
  }

  return gaps.slice(0, limit);
}
