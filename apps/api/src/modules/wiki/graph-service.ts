import fs from "node:fs";
import path from "node:path";
// graphology 使用 export default class Graph，但 NodeNext 下的 TS 模块解析
// 无法暴露可构造类型。故在运行时通过动态 import() 加载。
let _Graph: any = null;
let _Louvain: any = null;
async function ensureGraphLibs() {
  if (!_Graph) _Graph = (await import("graphology")).default;
  if (!_Louvain) _Louvain = (await import("graphology-communities-louvain")).default;
}
import {
  buildWikiGraph,
  findSurprisingConnections,
  detectKnowledgeGaps,
  normalizePath,
} from "@feedmind/wiki-core";
import type { GraphNode, GraphEdge, CommunityInfo } from "@feedmind/contracts";
import { spaceDir } from "./wiki-utils.js";

function collectMdFiles(dir: string): Array<{ name: string; path: string; is_dir: boolean }> {
  const results: Array<{ name: string; path: string; is_dir: boolean }> = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      results.push({ name: entry.name, path: fullPath, is_dir: entry.isDirectory() });
      if (entry.isDirectory()) {
        results.push(...collectMdFiles(fullPath));
      }
    }
  } catch {
    /* dir doesn't exist */
  }
  return results;
}

export async function getWikiGraph(
  spaceId: string,
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[]; communities: CommunityInfo[] }> {
  const wikiDir = path.join(spaceDir(spaceId), "wiki");
  if (!fs.existsSync(wikiDir)) {
    return { nodes: [], edges: [], communities: [] };
  }

  const mdFiles = collectMdFiles(wikiDir).filter((f) => !f.is_dir && f.name.endsWith(".md"));

  const { nodes, edges } = await buildWikiGraph(
    async (filePath: string) => fs.readFileSync(filePath, "utf-8"),
    mdFiles.map((f) => ({ name: f.name, path: normalizePath(f.path), is_dir: f.is_dir })),
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

  const nodeInfo = new Map(nodes.map((n) => [n.id, { label: n.label, linkCount: n.linkCount }]));
  const communities: CommunityInfo[] = [];

  for (const [commId, memberIds] of groups) {
    const n = memberIds.length;

    let intraEdges = 0;
    for (let i = 0; i < memberIds.length; i++) {
      for (let j = i + 1; j < memberIds.length; j++) {
        if (edgeSet.has(`${memberIds[i]}:::${memberIds[j]}`)) intraEdges++;
      }
    }
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
  communities.forEach((c, idx) => {
    idRemap.set(c.id, idx);
    c.id = idx;
  });

  const remappedAssignments = new Map<string, number>();
  for (const [nodeId, oldComm] of Object.entries(communityMap)) {
    remappedAssignments.set(nodeId, idRemap.get(oldComm) ?? 0);
  }

  return { communities, assignments: remappedAssignments };
}

export async function getWikiGraphInsights(spaceId: string) {
  const { nodes, edges, communities } = await getWikiGraph(spaceId);
  const surprising = findSurprisingConnections(nodes, edges, communities, 5);
  const gaps = detectKnowledgeGaps(nodes, edges, communities);
  return { surprising, gaps, nodeCount: nodes.length, edgeCount: edges.length };
}
