import { describe, expect, it } from "vitest";
import type { CommunityInfo, GraphEdge, GraphNode } from "@feedmind/contracts";
import { detectKnowledgeGaps, findSurprisingConnections } from "./graph-insights.js";

const node = (id: string, type: string, linkCount: number, community: number): GraphNode => ({
  id,
  label: id,
  type,
  path: `/wiki/${id}.md`,
  linkCount,
  community,
});

describe("findSurprisingConnections", () => {
  const nodes: GraphNode[] = [
    node("index", "concept", 10, 0),
    node("A", "concept", 5, 0),
    node("B", "source", 1, 1),
    node("C", "concept", 1, 0),
  ];
  const edges: GraphEdge[] = [
    { source: "A", target: "B", weight: 1 }, // 跨社区 + 类型差异 + 边缘连枢纽
    { source: "A", target: "C", weight: 1 }, // 同社区同类型，仅边缘连枢纽，分数不足
    { source: "index", target: "A", weight: 1 }, // 结构节点排除
  ];

  it("按跨社区/类型差异/枢纽连接打分并排序", () => {
    const result = findSurprisingConnections(nodes, edges, []);
    expect(result).toHaveLength(1);
    expect(result[0]?.source.id).toBe("A");
    expect(result[0]?.target.id).toBe("B");
    expect(result[0]?.score).toBe(7);
    expect(result[0]?.reasons).toContain("跨越社区边界");
  });

  it("limit 限制返回数量，0 时为空", () => {
    expect(findSurprisingConnections(nodes, edges, [], 0)).toEqual([]);
  });
});

describe("detectKnowledgeGaps", () => {
  const nodes: GraphNode[] = [
    node("iso", "concept", 0, 0), // 孤立
    node("h", "concept", 3, 0), // 桥接
    node("n1", "concept", 1, 1),
    node("n2", "concept", 1, 2),
    node("n3", "concept", 1, 3),
  ];
  const edges: GraphEdge[] = [
    { source: "h", target: "n1", weight: 1 },
    { source: "h", target: "n2", weight: 1 },
    { source: "h", target: "n3", weight: 1 },
  ];
  const communities: CommunityInfo[] = [
    { id: 9, nodeCount: 3, cohesion: 0.1, topNodes: ["n1", "n2", "n3"] },
  ];

  it("识别孤立节点、稀疏社区与桥接节点", () => {
    const gaps = detectKnowledgeGaps(nodes, edges, communities);
    expect(gaps.some((g) => g.type === "isolated-node" && g.nodeIds.includes("iso"))).toBe(true);
    expect(gaps.some((g) => g.type === "sparse-community")).toBe(true);
    expect(gaps.some((g) => g.type === "bridge-node" && g.nodeIds.includes("h"))).toBe(true);
  });

  it("凝聚度达标或节点数不足的社区不报稀疏", () => {
    const tight = [{ ...communities[0]!, cohesion: 0.5 }];
    const small = [{ ...communities[0]!, nodeCount: 2 }];
    expect(
      detectKnowledgeGaps(nodes, edges, tight).some((g) => g.type === "sparse-community"),
    ).toBe(false);
    expect(
      detectKnowledgeGaps(nodes, edges, small).some((g) => g.type === "sparse-community"),
    ).toBe(false);
  });

  it("无边的图只报孤立节点", () => {
    const gaps = detectKnowledgeGaps([node("only", "concept", 0, 0)], [], []);
    expect(gaps.map((g) => g.type)).toEqual(["isolated-node"]);
  });
});
