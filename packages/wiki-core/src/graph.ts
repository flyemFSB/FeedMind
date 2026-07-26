import type { GraphNode, GraphEdge } from "@feedmind/contracts";
import { extractString, parseFrontmatter } from "./frontmatter.js";
import { conceptIdFromPath, extractConceptLinks } from "./links.js";
import { getRelativePath, normalizePath } from "./paths.js";

export interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  children?: FileNode[];
}

export async function buildWikiGraph(
  readFileFn: (path: string) => Promise<string>,
  mdFiles: FileNode[],
  bundleRoot: string,
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  const nodeMap = new Map<
    string,
    { id: string; label: string; type: string; path: string; links: string[] }
  >();

  for (const file of mdFiles) {
    if (file.is_dir || !file.name.toLowerCase().endsWith(".md")) continue;

    const relativePath = getRelativePath(normalizePath(file.path), normalizePath(bundleRoot));
    const fileName = relativePath.split("/").at(-1)?.toLowerCase();
    if (fileName === "index.md" || fileName === "log.md") continue;

    const id = conceptIdFromPath(relativePath);
    let content: string;
    try {
      content = await readFileFn(file.path);
    } catch {
      continue;
    }

    const { frontmatter, body } = parseFrontmatter(content);
    const title = extractString(frontmatter, "title") ?? id.split("/").at(-1) ?? id;
    const type = extractString(frontmatter, "type") ?? "Reference";

    nodeMap.set(id, {
      id,
      label: title,
      type,
      path: file.path,
      links: extractConceptLinks(body, id),
    });
  }

  const linkCounts = new Map<string, number>();
  for (const [id] of nodeMap) linkCounts.set(id, 0);

  const rawEdges: { source: string; target: string }[] = [];
  for (const [sourceId, nodeData] of nodeMap) {
    for (const targetRaw of nodeData.links) {
      const targetId = nodeMap.has(targetRaw) ? targetRaw : null;
      if (!targetId || targetId === sourceId) continue;

      rawEdges.push({ source: sourceId, target: targetId });
      linkCounts.set(sourceId, (linkCounts.get(sourceId) ?? 0) + 1);
      linkCounts.set(targetId, (linkCounts.get(targetId) ?? 0) + 1);
    }
  }

  const seenEdges = new Set<string>();
  const edges: GraphEdge[] = [];
  for (const edge of rawEdges) {
    const key = `${edge.source}:::${edge.target}`;
    if (!seenEdges.has(key)) {
      seenEdges.add(key);
      edges.push({
        ...edge,
        weight: 1,
      });
    }
  }

  const nodes: GraphNode[] = Array.from(nodeMap.values()).map((n) => ({
    id: n.id,
    label: n.label,
    type: n.type,
    path: n.path,
    linkCount: linkCounts.get(n.id) ?? 0,
  }));

  return { nodes, edges };
}
