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
 * 发现跨社区或跨类型的连接。
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
  const STRUCTURAL_IDS = new Set(["index", "log"]);

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
      reasons.push("跨越社区边界");
    }

    if (source.type !== target.type) {
      const distantPairs = new Set(["source-concept", "concept-source"]);
      const pair = `${source.type}-${target.type}`;
      if (distantPairs.has(pair)) {
        score += 2;
        reasons.push(`连接${source.type}与${target.type}`);
      } else {
        score += 1;
        reasons.push("类型不同");
      }
    }

    const sourceDeg = degreeMap.get(source.id) ?? 0;
    const targetDeg = degreeMap.get(target.id) ?? 0;
    const minDeg = Math.min(sourceDeg, targetDeg);
    if (minDeg <= 2 && Math.max(sourceDeg, targetDeg) >= maxDegree * 0.5) {
      score += 2;
      reasons.push("边缘节点连接到枢纽");
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
 * 基于图结构检测知识缺口。
 */
export function detectKnowledgeGaps(
  nodes: GraphNode[],
  edges: GraphEdge[],
  communities: CommunityInfo[],
  limit: number = 8,
): KnowledgeGap[] {
  const gaps: KnowledgeGap[] = [];

  // 1. 孤立节点
  const isolatedNodes = nodes.filter((n) => n.linkCount <= 1 && n.id !== "index" && n.id !== "log");
  if (isolatedNodes.length > 0) {
    const topIsolated = isolatedNodes.slice(0, 5);
    gaps.push({
      type: "isolated-node",
      title: `${isolatedNodes.length} 个孤立页面`,
      description:
        topIsolated.map((n) => n.label).join(", ") +
        (isolatedNodes.length > 5 ? `，以及另外 ${isolatedNodes.length - 5} 个` : ""),
      nodeIds: isolatedNodes.map((n) => n.id),
      suggestion: "添加指向相关页面的 Markdown 链接，或补充页面内容。",
    });
  }

  // 2. 稀疏社区
  for (const comm of communities) {
    if (comm.cohesion < 0.15 && comm.nodeCount >= 3) {
      gaps.push({
        type: "sparse-community",
        title: `稀疏知识簇：${comm.topNodes[0] ?? `社区 ${comm.id}`}`,
        description: `${comm.nodeCount} 个页面，凝聚度 ${comm.cohesion.toFixed(2)}，内部连接较弱。`,
        nodeIds: nodes.filter((n) => (n.community ?? 0) === comm.id).map((n) => n.id),
        suggestion: "在这些页面之间补充交叉引用。",
      });
    }
  }

  // 3. 桥接节点（连接多个社区）
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

  const STRUCTURAL_IDS = new Set(["index", "log"]);
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
      title: `关键桥接节点：${bridge.label}`,
      description: `连接了 ${commCount} 个不同的知识簇。`,
      nodeIds: [bridge.id],
      suggestion: "确保该桥接页面得到持续维护。",
    });
  }

  return gaps.slice(0, limit);
}
