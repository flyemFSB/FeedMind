import type { GraphNode, GraphEdge } from "@feedmind/contracts";

// ─── Signal Weights ────────────────────────────────────────────────

const WEIGHTS = {
  directLink: 3.0,
  sourceOverlap: 4.0,
  commonNeighbor: 1.5,
  typeAffinity: 1.0,
} as const;

/** Per-type affinity multipliers — which page types tend to relate. */
const TYPE_AFFINITY: Record<string, Record<string, number>> = {
  entity: { concept: 1.2, entity: 0.8, source: 1.0, overview: 1.0, index: 0.5 },
  concept: { entity: 1.2, concept: 0.8, source: 1.0, overview: 1.2, index: 0.5 },
  source: { entity: 1.0, concept: 1.0, overview: 1.0, index: 0.5, source: 0.5 },
  overview: { entity: 1.0, concept: 1.2, source: 1.0, overview: 0.5, index: 0.5 },
  index: { entity: 0.5, concept: 0.5, source: 0.5, overview: 0.5, index: 0.3 },
};

// ─── Page Data ─────────────────────────────────────────────────────

export interface RelevancePage {
  id: string;
  title: string;
  type: string;
  path: string;
  sources: string[];
  outLinks: string[];
}

// ─── Edge Builder ───────────────────────────────────────────────────

export interface RelevanceResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Build a weighted graph using the four-signal relevance model:
 *
 *  1. directLink  (×3.0) — [[wikilink]] connections
 *  2. sourceOverlap (×4.0) — pages sharing the same source documents
 *  3. Adamic-Adar (×1.5) — common neighbors weighted by degree
 *  4. typeAffinity (×1.0) — type-compatibility bonus
 *
 * Edges scored below MIN_EDGE_SCORE are discarded to keep the graph clean.
 */
export function buildRelevanceGraph(pages: RelevancePage[]): RelevanceResult {
  const nodeMap = new Map(pages.map((p) => [p.id, p]));

  // Build adjacency list from wikilinks for downstream signal computation
  const adjacency = new Map<string, Set<string>>();
  for (const page of pages) {
    adjacency.set(page.id, new Set());
  }
  for (const page of pages) {
    for (const target of page.outLinks) {
      if (nodeMap.has(target) && target !== page.id) {
        adjacency.get(page.id)?.add(target);
        adjacency.get(target)?.add(page.id);
      }
    }
  }

  // Source-to-pages map
  const sourceToPages = new Map<string, Set<string>>();
  for (const page of pages) {
    for (const src of page.sources) {
      const set = sourceToPages.get(src) ?? new Set();
      set.add(page.id);
      sourceToPages.set(src, set);
    }
  }

  // ─── Signal 1: Direct Link (×3.0) ────────────────────────────────
  const edgeScores = new Map<string, { directLink: number; sourceOverlap: number; adamicAdar: number; typeAffinity: number }>();

  function edgeKey(a: string, b: string): string {
    return a < b ? `${a}:::${b}` : `${b}:::${a}`;
  }

  function initEdge(a: string, b: string) {
    const key = edgeKey(a, b);
    if (!edgeScores.has(key)) {
      edgeScores.set(key, { directLink: 0, sourceOverlap: 0, adamicAdar: 0, typeAffinity: 0 });
    }
    return key;
  }

  for (const page of pages) {
    for (const target of page.outLinks) {
      if (!nodeMap.has(target) || target === page.id) continue;
      initEdge(page.id, target);
      edgeScores.get(edgeKey(page.id, target))!.directLink = WEIGHTS.directLink;
    }
  }

  // ─── Signal 2: Source Overlap (×4.0) ─────────────────────────────
  for (const [, pageIds] of sourceToPages) {
    const ids = [...pageIds];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        initEdge(ids[i], ids[j]);
        // Accumulate: each shared source adds proportional weight
        edgeScores.get(edgeKey(ids[i], ids[j]))!.sourceOverlap = WEIGHTS.sourceOverlap;
      }
    }
  }

  // ─── Signal 3: Adamic-Adar (×1.5) ────────────────────────────────
  // For each pair of nodes sharing a common neighbor N:
  //   contribution = 1 / log(degree of N)
  // Weighted by WEIGHTS.commonNeighbor
  const degree = new Map<string, number>();
  for (const [id, neighbors] of adjacency) {
    degree.set(id, neighbors.size);
  }

  // Optimize: only compute for existing edge pairs to avoid O(n²)
  // For each node N, for each pair of N's neighbors, add AA score
  for (const [center, neighbors] of adjacency) {
    const deg = degree.get(center) ?? 1;
    const aaContrib = WEIGHTS.commonNeighbor / (1 + Math.log(deg));
    const neighborArr = [...neighbors];
    for (let i = 0; i < neighborArr.length; i++) {
      for (let j = i + 1; j < neighborArr.length; j++) {
        const a = neighborArr[i];
        const b = neighborArr[j];
        if (!nodeMap.has(a) || !nodeMap.has(b)) continue;
        initEdge(a, b);
        edgeScores.get(edgeKey(a, b))!.adamicAdar += aaContrib;
      }
    }
  }

  // ─── Signal 4: Type Affinity (×1.0) ──────────────────────────────
  for (const [key, scores] of edgeScores) {
    const [a, b] = key.split(":::");
    const pageA = nodeMap.get(a);
    const pageB = nodeMap.get(b);
    if (pageA && pageB) {
      const affinity = TYPE_AFFINITY[pageA.type]?.[pageB.type] ?? 1.0;
      scores.typeAffinity = affinity * WEIGHTS.typeAffinity;
    }
  }

  // ─── Combine ─────────────────────────────────────────────────────
  const MIN_EDGE_SCORE = 0.5;
  const edges: GraphEdge[] = [];
  const seenPairs = new Set<string>();

  for (const [key, scores] of edgeScores) {
    const [source, target] = key.split(":::");
    const total = scores.directLink + scores.sourceOverlap + scores.adamicAdar + scores.typeAffinity;
    if (total < MIN_EDGE_SCORE) continue;
    if (seenPairs.has(key)) continue;
    seenPairs.add(key);
    edges.push({ source, target, weight: Math.round(total * 10) / 10 });
  }

  // Build nodes with link counts
  const linkCounts = new Map<string, number>();
  for (const page of pages) linkCounts.set(page.id, 0);
  for (const edge of edges) {
    linkCounts.set(edge.source, (linkCounts.get(edge.source) ?? 0) + 1);
    linkCounts.set(edge.target, (linkCounts.get(edge.target) ?? 0) + 1);
  }

  const nodes: GraphNode[] = pages.map((p) => ({
    id: p.id,
    label: p.title,
    type: p.type,
    path: p.path,
    linkCount: linkCounts.get(p.id) ?? 0,
  }));

  return { nodes, edges };
}

/**
 * Return a per-edge breakdown of the four signal scores (for debugging / UI).
 */
export function explainEdgeScore(
  a: RelevancePage,
  b: RelevancePage,
  allPages: RelevancePage[],
): Record<string, number> {
  const temp = buildRelevanceGraph([a, b, ...allPages.filter((p) => p.id !== a.id && p.id !== b.id)]);
  const edge = temp.edges.find(
    (e) => (e.source === a.id && e.target === b.id) || (e.source === b.id && e.target === a.id),
  );
  if (!edge) return { directLink: 0, sourceOverlap: 0, adamicAdar: 0, typeAffinity: 0, total: 0 };

  // Re-derive individual signals for this pair
  const hasDirectLink = a.outLinks.includes(b.id) || b.outLinks.includes(a.id);
  const sharedSources = a.sources.filter((s) => b.sources.includes(s)).length;

  return {
    directLink: hasDirectLink ? WEIGHTS.directLink : 0,
    sourceOverlap: sharedSources > 0 ? WEIGHTS.sourceOverlap : 0,
    adamicAdar: 0, // can't recompute without full graph
    typeAffinity: (TYPE_AFFINITY[a.type]?.[b.type] ?? 1.0) * WEIGHTS.typeAffinity,
    total: edge.weight,
  };
}
