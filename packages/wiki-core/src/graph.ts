import type { GraphNode, GraphEdge } from "@feedmind/contracts";
import { extractWikilinks } from "./wikilinks.js";
import { parseFrontmatter } from "./frontmatter.js";

export interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  children?: FileNode[];
}

export async function buildWikiGraph(
  readFileFn: (path: string) => Promise<string>,
  mdFiles: FileNode[],
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  const nodeMap = new Map<string, { id: string; label: string; type: string; path: string; links: string[] }>();

  for (const file of mdFiles) {
    if (file.is_dir || !file.name.endsWith(".md")) continue;

    const id = fileNameToId(file.name);
    let content: string;
    try {
      content = await readFileFn(file.path);
    } catch {
      continue;
    }

    const { frontmatter } = parseFrontmatter(content);
    const title = (frontmatter.title as string) || fileNameToTitle(file.name);
    const type = (frontmatter.type as string) || "concept";

    nodeMap.set(id, {
      id,
      label: title,
      type,
      path: file.path,
      links: extractWikilinks(content),
    });
  }

  const linkCounts = new Map<string, number>();
  for (const [id] of nodeMap) linkCounts.set(id, 0);

  const rawEdges: { source: string; target: string; weight: number }[] = [];
  for (const [sourceId, nodeData] of nodeMap) {
    for (const targetRaw of nodeData.links) {
      const targetId = resolveTarget(targetRaw, nodeMap);
      if (!targetId || targetId === sourceId) continue;

      rawEdges.push({ source: sourceId, target: targetId, weight: 1 });
      linkCounts.set(sourceId, (linkCounts.get(sourceId) ?? 0) + 1);
      linkCounts.set(targetId, (linkCounts.get(targetId) ?? 0) + 1);
    }
  }

  const seenEdges = new Set<string>();
  const dedupedEdges: { source: string; target: string }[] = [];
  for (const edge of rawEdges) {
    const key = `${edge.source}:::${edge.target}`;
    const reverseKey = `${edge.target}:::${edge.source}`;
    if (!seenEdges.has(key) && !seenEdges.has(reverseKey)) {
      seenEdges.add(key);
      dedupedEdges.push(edge);
    }
  }

  const edges: GraphEdge[] = dedupedEdges.map((e) => ({ ...e, weight: 1 }));

  const nodes: GraphNode[] = Array.from(nodeMap.values()).map((n) => ({
    id: n.id,
    label: n.label,
    type: n.type,
    path: n.path,
    linkCount: linkCounts.get(n.id) ?? 0,
  }));

  return { nodes, edges };
}

function fileNameToId(fileName: string): string {
  return fileName.replace(/\.md$/, "");
}

function fileNameToTitle(fileName: string): string {
  return fileName.replace(/\.md$/, "").replace(/-/g, " ");
}

function resolveTarget(
  raw: string,
  nodeMap: Map<string, { id: string }>,
): string | null {
  if (nodeMap.has(raw)) return raw;

  const normalized = raw.toLowerCase().replace(/\s+/g, "-");
  for (const id of nodeMap.keys()) {
    if (id.toLowerCase() === normalized) return id;
    if (id.toLowerCase() === raw.toLowerCase()) return id;
    if (id.toLowerCase().replace(/\s+/g, "-") === normalized) return id;
  }

  return null;
}
