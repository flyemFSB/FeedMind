import { readFile } from "node:fs/promises";
import fs from "node:fs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- graphology 是动态导入的 JS 库
let _Graph: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _Louvain: any = null;
async function ensureGraphLibs() {
  if (!_Graph) _Graph = (await import("graphology")).default;
  if (!_Louvain) _Louvain = (await import("graphology-communities-louvain")).default;
}
import { buildWikiGraph, normalizePath } from "@feedmind/wiki-core";
import type { GraphNode, GraphEdge, CommunityInfo } from "@feedmind/contracts";
import { getWikiDir, collectFileEntries, isSystemFile } from "./space-fs/index.js";

export async function getWikiGraph(
  spaceId: string,
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[]; communities: CommunityInfo[] }> {
  const wikiDir = getWikiDir(spaceId);
  if (!fs.existsSync(wikiDir)) {
    return { nodes: [], edges: [], communities: [] };
  }

  const mdFiles = collectFileEntries(wikiDir).filter(
    (f) => !f.is_dir && f.name.toLowerCase().endsWith(".md") && !isSystemFile(f.name),
  );

  const { nodes, edges } = await buildWikiGraph(
    async (filePath: string) => readFile(filePath, "utf-8"), // 异步读取避免阻塞
    mdFiles.map((f) => ({ name: f.name, path: normalizePath(f.path), is_dir: f.is_dir })),
    normalizePath(wikiDir),
  );

  if (nodes.length === 0) {
    return { nodes, edges, communities: [] };
  }

  const { communities, assignments } = await detectCommunities(nodes, edges);
  const enrichedNodes = nodes.map((n) => ({
    ...n,
    community: assignments.get(n.id) ?? 0,
  }));

  return { nodes: enrichedNodes, edges, communities };
}

async function detectCommunities(
  nodes: GraphNode[],
  edges: GraphEdge[],
): Promise<{ communities: CommunityInfo[]; assignments: Map<string, number> }> {
  await ensureGraphLibs();
  const g = new _Graph({ type: "undirected" });

  for (const node of nodes) {
    g.addNode(node.id);
  }
  for (const edge of edges) {
    if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
      const key = `${edge.source}->${edge.target}`;
      if (!g.hasEdge(key) && !g.hasEdge(`${edge.target}->${edge.source}`)) {
        try {
          g.addEdgeWithKey(key, edge.source, edge.target, { weight: edge.weight });
        } catch {
          // graphology 可能在边已存在时抛出异常
        }
      }
    }
  }

  const communityMap: Record<string, number> = _Louvain(g, { resolution: 1 });
  const rawAssignments = new Map(Object.entries(communityMap).map(([k, v]) => [k, v as number]));

  for (const node of nodes) {
    node.community = rawAssignments.get(node.id) ?? 0;
  }

  const groups = new Map<number, string[]>();
  for (const [nodeId, commId] of rawAssignments) {
    const list = groups.get(commId) ?? [];
    list.push(nodeId);
    groups.set(commId, list);
  }

  const edgeSet = new Set<string>();
  for (const edge of edges) {
    edgeSet.add(`${edge.source}:::${edge.target}`);
    edgeSet.add(`${edge.target}:::${edge.source}`);
  }

  // 构建邻接表以提高查询效率 O(1) 而非 O(n)
  const adjacencyMap = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!adjacencyMap.has(edge.source)) adjacencyMap.set(edge.source, new Set());
    if (!adjacencyMap.has(edge.target)) adjacencyMap.set(edge.target, new Set());
    adjacencyMap.get(edge.source)!.add(edge.target);
    adjacencyMap.get(edge.target)!.add(edge.source);
  }

  const nodeInfo = new Map(nodes.map((n) => [n.id, { label: n.label, linkCount: n.linkCount }]));
  const communities: CommunityInfo[] = [];

  for (const [commId, memberIds] of groups) {
    const n = memberIds.length;

    // 使用邻接表快速计算内部边数 O(n) 而非 O(n²)
    let intraEdges = 0;
    for (const memberId of memberIds) {
      const neighbors = adjacencyMap.get(memberId) ?? new Set();
      for (const otherId of memberIds) {
        if (otherId !== memberId && neighbors.has(otherId)) {
          intraEdges++;
        }
      }
    }
    intraEdges /= 2; // 每条边被计数两次
    const possibleEdges = n > 1 ? (n * (n - 1)) / 2 : 1;
    const cohesion = intraEdges / possibleEdges;

    const sorted = [...memberIds].sort(
      (a, b) => (nodeInfo.get(b)?.linkCount ?? 0) - (nodeInfo.get(a)?.linkCount ?? 0),
    );
    const topNodes = sorted.slice(0, 5).map((id) => nodeInfo.get(id)?.label ?? id);

    communities.push({ id: commId, nodeCount: n, cohesion, topNodes });
  }

  communities.sort((a, b) => b.nodeCount - a.nodeCount);

  const idRemap = new Map<number, number>();
  // 将社区 ID 从大到小映射为 0, 1, 2...
  communities.forEach((comm, idx) => {
    idRemap.set(comm.id, idx);
    comm.id = idx;
  });

  const remappedAssignments = new Map<string, number>();
  for (const [nodeId, oldComm] of Object.entries(communityMap)) {
    remappedAssignments.set(nodeId, idRemap.get(oldComm) ?? 0);
  }

  return { communities, assignments: remappedAssignments };
}

export async function getWikiGraphInsights(spaceId: string) {
  const { nodes, edges, communities } = await getWikiGraph(spaceId);
  const { findSurprisingConnections, detectKnowledgeGaps } = await import("@feedmind/wiki-core");
  const surprising = findSurprisingConnections(nodes, edges, communities, 5);
  const gaps = detectKnowledgeGaps(nodes, edges, communities);
  return { surprising, gaps, nodeCount: nodes.length, edgeCount: edges.length };
}
