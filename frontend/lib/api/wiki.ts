import type { WikiGraphEdge, WikiGraphNode, WikiGraphResponse, WikiIngestResult, WikiPage, WikiSource, WikiSpace } from "@/lib/types";
import { apiFetch } from "./client";

export type WikiSpaceResponse = {
  id: string; name: string; description: string; category: WikiSpace["category"];
  page_count: number; source_count: number; chunk_count: number; updated_at: string; tags: string[];
};

export type WikiPageResponse = {
  id: string; space_id: string; title: string; type: WikiPage["type"];
  source: string; status: WikiPage["status"]; chunk_count: number; relation_count: number; updated_at: string;
};

export type WikiGraphEdgeResponse = Omit<WikiGraphEdge, "relationType" | "signals"> & {
  relation_type: string;
  signals: { direct_link: number; source_overlap: number; common_neighbor: number; type_affinity: number };
};

export type WikiGraphNodeResponse = Omit<WikiGraphNode, "linkCount"> & { link_count: number };

export type WikiGraphResponseWire = {
  nodes: WikiGraphNodeResponse[]; edges: WikiGraphEdgeResponse[];
  stats: { node_count: number; edge_count: number; page_count: number; source_count: number };
};

type WikiSourceResponse = {
  id: string; space_id: string; filename: string; status: string;
  error_message: string; page_count: number; created_at: string; updated_at: string;
};

type WikiIngestResultResponse = {
  source_id: string; status: string; page_count: number; written_paths: string[]; error?: string | null;
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function toWikiSpace(space: WikiSpaceResponse): WikiSpace { return { id: space.id, name: space.name, description: space.description, category: space.category, pageCount: space.page_count, sourceCount: space.source_count, chunkCount: space.chunk_count, updatedAt: formatDate(space.updated_at), tags: space.tags }; }
function toWikiPage(page: WikiPageResponse): WikiPage { return { id: page.id, spaceId: page.space_id, title: page.title, source: page.source, status: page.status, type: page.type, chunkCount: page.chunk_count, relationCount: page.relation_count, updatedAt: formatDate(page.updated_at) }; }
function toWikiGraph(graph: WikiGraphResponseWire): WikiGraphResponse { return { nodes: graph.nodes.map((node) => ({ id: node.id, title: node.title, type: node.type, status: node.status, source: node.source, linkCount: node.link_count })), edges: graph.edges.map((edge) => ({ source: edge.source, target: edge.target, weight: edge.weight, relationType: edge.relation_type, signals: { directLink: edge.signals.direct_link, sourceOverlap: edge.signals.source_overlap, commonNeighbor: edge.signals.common_neighbor, typeAffinity: edge.signals.type_affinity } })), stats: { nodeCount: graph.stats.node_count, edgeCount: graph.stats.edge_count, pageCount: graph.stats.page_count, sourceCount: graph.stats.source_count } }; }

export { toWikiSpace, toWikiPage, toWikiGraph };

function toSource(s: WikiSourceResponse): WikiSource {
  return { id: s.id, spaceId: s.space_id, filename: s.filename, status: s.status as WikiSource["status"], errorMessage: s.error_message, pageCount: s.page_count, createdAt: s.created_at, updatedAt: s.updated_at };
}

function toResult(r: WikiIngestResultResponse): WikiIngestResult {
  return { sourceId: r.source_id, status: r.status, pageCount: r.page_count, writtenPaths: r.written_paths, error: r.error };
}

export async function listWikiSpaces(signal?: AbortSignal): Promise<WikiSpace[]> {
  return (await apiFetch<WikiSpaceResponse[]>("/api/wiki-spaces", { signal })).map(toWikiSpace);
}

export async function listWikiPages(spaceId: string, signal?: AbortSignal): Promise<WikiPage[]> {
  return (await apiFetch<WikiPageResponse[]>(`/api/wiki-spaces/${encodeURIComponent(spaceId)}/pages`, { signal })).map(toWikiPage);
}

export async function getWikiGraph(spaceId: string, signal?: AbortSignal): Promise<WikiGraphResponse> {
  return toWikiGraph(await apiFetch<WikiGraphResponseWire>(`/api/wiki-spaces/${encodeURIComponent(spaceId)}/graph`, { signal }));
}

export async function listSources(spaceId: string, signal?: AbortSignal): Promise<WikiSource[]> {
  return (await apiFetch<WikiSourceResponse[]>(`/api/wiki-spaces/${encodeURIComponent(spaceId)}/sources`, { signal })).map(toSource);
}

export async function createSource(spaceId: string, filename: string, content: string): Promise<WikiSource> {
  return toSource(await apiFetch<WikiSourceResponse>(`/api/wiki-spaces/${encodeURIComponent(spaceId)}/sources`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename, content }),
  }));
}

export async function deleteSource(spaceId: string, sourceId: string): Promise<void> {
  await apiFetch<{ deleted: boolean }>(`/api/wiki-spaces/${encodeURIComponent(spaceId)}/sources/${encodeURIComponent(sourceId)}`, { method: "DELETE" });
}

export async function ingestSources(spaceId: string, sourceIds: string[]): Promise<WikiIngestResult[]> {
  return (await apiFetch<WikiIngestResultResponse[]>(`/api/wiki-spaces/${encodeURIComponent(spaceId)}/ingestions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source_ids: sourceIds }),
  })).map(toResult);
}
