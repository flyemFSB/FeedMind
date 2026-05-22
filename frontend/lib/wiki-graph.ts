import Graph from "graphology";
import louvain from "graphology-communities-louvain";

import type {
  WikiGraphCommunity,
  WikiGraphEdge,
  WikiGraphInsight,
  WikiGraphNode,
} from "@/lib/types";

export const NODE_TYPE_COLORS: Record<string, string> = {
  entity: "#0071e3",
  concept: "#8e8e93",
  source: "#ff9f0a",
  synthesis: "#34c759",
  comparison: "#5ac8fa",
  overview: "#1d1d1f",
  query: "#af52de",
  other: "#6e6e73",
};

export const COMMUNITY_COLORS = [
  "#0071e3",
  "#34c759",
  "#ff9f0a",
  "#af52de",
  "#ff3b30",
  "#5ac8fa",
  "#ffcc00",
  "#ff2d55",
  "#5856d6",
  "#32d74b",
  "#64d2ff",
  "#ffd60a",
];

export function buildGraphologyGraph(nodes: WikiGraphNode[], edges: WikiGraphEdge[]): Graph {
  const graph = new Graph({ type: "undirected" });

  for (const node of nodes) {
    graph.addNode(node.id, {
      label: node.title,
      nodeType: node.type,
      linkCount: node.linkCount,
    });
  }

  for (const edge of edges) {
    if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) continue;
    graph.mergeEdge(edge.source, edge.target, {
      weight: edge.weight,
      relationType: edge.relationType,
    });
  }

  return graph;
}

export function detectCommunities(
  nodes: WikiGraphNode[],
  edges: WikiGraphEdge[],
): { assignments: Map<string, number>; communities: WikiGraphCommunity[] } {
  if (nodes.length === 0) return { assignments: new Map(), communities: [] };

  const graph = buildGraphologyGraph(nodes, edges);
  const rawAssignments = louvain(graph, { resolution: 1 }) as Record<string, number>;
  const groups = new Map<number, string[]>();

  for (const [nodeId, communityId] of Object.entries(rawAssignments)) {
    groups.set(communityId, [...(groups.get(communityId) ?? []), nodeId]);
  }

  const edgeSet = new Set<string>();
  for (const edge of edges) {
    edgeSet.add(`${edge.source}:::${edge.target}`);
    edgeSet.add(`${edge.target}:::${edge.source}`);
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const communities = [...groups.entries()]
    .map(([id, nodeIds]) => {
      let intraEdges = 0;
      for (let i = 0; i < nodeIds.length; i++) {
        for (let j = i + 1; j < nodeIds.length; j++) {
          if (edgeSet.has(`${nodeIds[i]}:::${nodeIds[j]}`)) intraEdges++;
        }
      }
      const possibleEdges = nodeIds.length > 1 ? (nodeIds.length * (nodeIds.length - 1)) / 2 : 1;
      const topNodes = [...nodeIds]
        .sort((a, b) => (nodeById.get(b)?.linkCount ?? 0) - (nodeById.get(a)?.linkCount ?? 0))
        .slice(0, 5)
        .map((nodeId) => nodeById.get(nodeId)?.title ?? nodeId);

      return {
        id,
        nodeCount: nodeIds.length,
        cohesion: intraEdges / possibleEdges,
        topNodes,
      };
    })
    .sort((a, b) => b.nodeCount - a.nodeCount);

  const idRemap = new Map<number, number>();
  communities.forEach((community, index) => {
    idRemap.set(community.id, index);
    community.id = index;
  });

  const assignments = new Map<string, number>();
  for (const [nodeId, communityId] of Object.entries(rawAssignments)) {
    assignments.set(nodeId, idRemap.get(communityId) ?? 0);
  }

  return { assignments, communities };
}

export function detectGraphInsights(
  nodes: WikiGraphNode[],
  edges: WikiGraphEdge[],
  assignments: Map<string, number>,
  communities: WikiGraphCommunity[],
): WikiGraphInsight[] {
  const insights: WikiGraphInsight[] = [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const communityNeighbors = new Map<string, Set<number>>();

  for (const node of nodes) {
    communityNeighbors.set(node.id, new Set());
  }

  for (const edge of edges) {
    const sourceCommunity = assignments.get(edge.source);
    const targetCommunity = assignments.get(edge.target);
    if (targetCommunity !== undefined) communityNeighbors.get(edge.source)?.add(targetCommunity);
    if (sourceCommunity !== undefined) communityNeighbors.get(edge.target)?.add(sourceCommunity);
  }

  const isolatedNodes = nodes.filter((node) => node.linkCount <= 1 && node.type !== "overview");
  if (isolatedNodes.length > 0) {
    insights.push({
      id: "isolated-node",
      type: "isolated-node",
      title: `${isolatedNodes.length} 个弱连接页面`,
      description: isolatedNodes.slice(0, 3).map((node) => node.title).join("、"),
      nodeIds: isolatedNodes.map((node) => node.id),
    });
  }

  for (const community of communities) {
    if (community.nodeCount >= 3 && community.cohesion < 0.15) {
      insights.push({
        id: `sparse-community-${community.id}`,
        type: "sparse-community",
        title: `低内聚聚类：${community.topNodes[0] ?? `社区 ${community.id}`}`,
        description: `${community.nodeCount} 个页面，内聚度 ${community.cohesion.toFixed(2)}`,
        nodeIds: nodes
          .filter((node) => assignments.get(node.id) === community.id)
          .map((node) => node.id),
      });
    }
  }

  const bridgeNodes = nodes
    .filter((node) => (communityNeighbors.get(node.id)?.size ?? 0) >= 3)
    .sort((a, b) => (communityNeighbors.get(b.id)?.size ?? 0) - (communityNeighbors.get(a.id)?.size ?? 0))
    .slice(0, 3);

  for (const node of bridgeNodes) {
    insights.push({
      id: `bridge-node-${node.id}`,
      type: "bridge-node",
      title: `桥接节点：${node.title}`,
      description: `连接 ${communityNeighbors.get(node.id)?.size ?? 0} 个知识聚类`,
      nodeIds: [node.id],
    });
  }

  const crossCommunityEdge = edges.find((edge) => assignments.get(edge.source) !== assignments.get(edge.target));
  if (crossCommunityEdge) {
    const source = nodeById.get(crossCommunityEdge.source);
    const target = nodeById.get(crossCommunityEdge.target);
    insights.push({
      id: `surprising-${crossCommunityEdge.source}-${crossCommunityEdge.target}`,
      type: "surprising-connection",
      title: "跨社区连接",
      description: `${source?.title ?? "未知页面"} ↔ ${target?.title ?? "未知页面"}`,
      nodeIds: [crossCommunityEdge.source, crossCommunityEdge.target],
    });
  }

  return insights.slice(0, 8);
}
