import { describe, expect, it } from "vitest";

import {
  buildGraphologyGraph,
  detectCommunities,
  detectGraphInsights,
} from "../lib/wiki-graph";
import type { WikiGraphEdge, WikiGraphNode } from "../lib/types";

const nodes: WikiGraphNode[] = [
  {
    id: "node-a",
    title: "产品研究",
    type: "concept",
    status: "indexed",
    source: "manual note",
    linkCount: 2,
  },
  {
    id: "node-b",
    title: "引用策略",
    type: "entity",
    status: "indexed",
    source: "manual note",
    linkCount: 2,
  },
  {
    id: "node-c",
    title: "检索评估",
    type: "comparison",
    status: "indexed",
    source: "github",
    linkCount: 2,
  },
  {
    id: "node-d",
    title: "孤立剪藏",
    type: "source",
    status: "indexed",
    source: "web clip",
    linkCount: 0,
  },
];

const edges: WikiGraphEdge[] = [
  {
    source: "node-a",
    target: "node-b",
    weight: 7,
    relationType: "wikilink",
    signals: {
      directLink: 3,
      sourceOverlap: 4,
      commonNeighbor: 0,
      typeAffinity: 1,
    },
  },
  {
    source: "node-b",
    target: "node-c",
    weight: 4,
    relationType: "wikilink",
    signals: {
      directLink: 3,
      sourceOverlap: 0,
      commonNeighbor: 0,
      typeAffinity: 1,
    },
  },
];

describe("wiki graph helpers", () => {
  it("builds an undirected graphology graph from API nodes and edges", () => {
    const graph = buildGraphologyGraph(nodes, edges);

    expect(graph.order).toBe(4);
    expect(graph.size).toBe(2);
    expect(graph.hasEdge("node-a", "node-b")).toBe(true);
    expect(graph.getNodeAttribute("node-a", "label")).toBe("产品研究");
  });

  it("detects Louvain communities and computes cohesion", () => {
    const { assignments, communities } = detectCommunities(nodes, edges);

    expect(assignments.size).toBe(4);
    expect(communities.length).toBeGreaterThan(0);
    expect(communities.every((community) => community.cohesion >= 0 && community.cohesion <= 1)).toBe(true);
  });

  it("reports weakly connected pages as graph insights", () => {
    const { assignments, communities } = detectCommunities(nodes, edges);
    const insights = detectGraphInsights(nodes, edges, assignments, communities);

    expect(insights.some((insight) => insight.type === "isolated-node")).toBe(true);
    expect(insights.flatMap((insight) => insight.nodeIds)).toContain("node-d");
  });
});
