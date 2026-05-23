import type {
  WikiGraphEdge,
  WikiGraphNode,
  WikiGraphNodeType,
  WikiGraphResponse,
  WikiIngestResult,
  WikiPage,
  WikiSource,
  WikiSourceDeleteImpact,
  WikiSourceDetail,
  WikiSourceJob,
  WikiSourcePage,
  WikiSpace,
} from "@/lib/types";
import { apiFetch, backendApiPath } from "./client";

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
  mime_type: string; import_kind: string; original_uri: string;
  content_size: number; version: number; last_job_id: string | null;
  related_page_count: number; last_job: WikiSourceJobResponse | null;
};

type WikiIngestResultResponse = {
  source_id: string; job_id?: string | null; status: string; page_count: number; written_paths: string[]; error?: string | null;
};

type WikiSourceJobResponse = {
  id: string; source_id: string; job_type: string; status: string; stage: string;
  progress_current: number; progress_total: number;
  error_message: string; created_at: string; updated_at: string;
  started_at?: string | null; finished_at?: string | null;
};

type WikiSourcePageResponse = {
  id: string; title: string; type: WikiGraphNodeType; relation: string; job_id?: string | null; updated_at: string;
};

type WikiSourceDetailResponse = WikiSourceResponse & { pages: WikiSourcePageResponse[]; jobs: WikiSourceJobResponse[] };

type WikiSourceDeleteImpactResponse = {
  source_id: string; filename: string; related_page_count: number; orphan_page_count: number; pages: WikiSourcePageResponse[];
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function toWikiSpace(space: WikiSpaceResponse): WikiSpace { return { id: space.id, name: space.name, description: space.description, category: space.category, pageCount: space.page_count, sourceCount: space.source_count, chunkCount: space.chunk_count, updatedAt: formatDate(space.updated_at), tags: space.tags }; }
function toWikiPage(page: WikiPageResponse): WikiPage { return { id: page.id, spaceId: page.space_id, title: page.title, source: page.source, status: page.status, type: page.type, chunkCount: page.chunk_count, relationCount: page.relation_count, updatedAt: formatDate(page.updated_at) }; }
function toWikiGraph(graph: WikiGraphResponseWire): WikiGraphResponse { return { nodes: graph.nodes.map((node) => ({ id: node.id, title: node.title, type: node.type, status: node.status, source: node.source, linkCount: node.link_count })), edges: graph.edges.map((edge) => ({ source: edge.source, target: edge.target, weight: edge.weight, relationType: edge.relation_type, signals: { directLink: edge.signals.direct_link, sourceOverlap: edge.signals.source_overlap, commonNeighbor: edge.signals.common_neighbor, typeAffinity: edge.signals.type_affinity } })), stats: { nodeCount: graph.stats.node_count, edgeCount: graph.stats.edge_count, pageCount: graph.stats.page_count, sourceCount: graph.stats.source_count } }; }

export { toWikiSpace, toWikiPage, toWikiGraph };

function toJob(job: WikiSourceJobResponse): WikiSourceJob {
  return {
    id: job.id,
    sourceId: job.source_id,
    jobType: job.job_type,
    status: job.status,
    stage: job.stage,
    progressCurrent: job.progress_current,
    progressTotal: job.progress_total,
    errorMessage: job.error_message,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
    startedAt: job.started_at,
    finishedAt: job.finished_at,
  };
}

function toSource(s: WikiSourceResponse): WikiSource {
  return {
    id: s.id,
    spaceId: s.space_id,
    filename: s.filename,
    status: s.status as WikiSource["status"],
    errorMessage: s.error_message,
    pageCount: s.page_count,
    mimeType: s.mime_type,
    importKind: s.import_kind,
    originalUri: s.original_uri,
    contentSize: s.content_size,
    version: s.version,
    lastJobId: s.last_job_id,
    relatedPageCount: s.related_page_count,
    lastJob: s.last_job ? toJob(s.last_job) : null,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
  };
}

function toResult(r: WikiIngestResultResponse): WikiIngestResult {
  return { sourceId: r.source_id, jobId: r.job_id, status: r.status, pageCount: r.page_count, writtenPaths: r.written_paths, error: r.error };
}

function toSourcePage(page: WikiSourcePageResponse): WikiSourcePage {
  return { id: page.id, title: page.title, type: page.type, relation: page.relation, jobId: page.job_id, updatedAt: formatDate(page.updated_at) };
}

function toSourceDetail(detail: WikiSourceDetailResponse): WikiSourceDetail {
  return { source: toSource(detail), pages: detail.pages.map(toSourcePage), jobs: detail.jobs.map(toJob) };
}

function toDeleteImpact(impact: WikiSourceDeleteImpactResponse): WikiSourceDeleteImpact {
  return {
    sourceId: impact.source_id,
    filename: impact.filename,
    relatedPageCount: impact.related_page_count,
    orphanPageCount: impact.orphan_page_count,
    pages: impact.pages.map(toSourcePage),
  };
}

export async function listWikiSpaces(signal?: AbortSignal): Promise<WikiSpace[]> {
  return (await apiFetch<WikiSpaceResponse[]>(backendApiPath("/wiki-spaces"), { signal })).map(toWikiSpace);
}

export async function listWikiPages(spaceId: string, signal?: AbortSignal): Promise<WikiPage[]> {
  return (await apiFetch<WikiPageResponse[]>(backendApiPath(`/wiki-spaces/${encodeURIComponent(spaceId)}/pages`), { signal })).map(toWikiPage);
}

export async function getWikiGraph(spaceId: string, signal?: AbortSignal): Promise<WikiGraphResponse> {
  return toWikiGraph(await apiFetch<WikiGraphResponseWire>(backendApiPath(`/wiki-spaces/${encodeURIComponent(spaceId)}/graph`), { signal }));
}

export async function listSources(spaceId: string, signal?: AbortSignal): Promise<WikiSource[]> {
  return (await apiFetch<WikiSourceResponse[]>(backendApiPath(`/wiki-spaces/${encodeURIComponent(spaceId)}/sources`), { signal })).map(toSource);
}

export async function getSourceDetail(spaceId: string, sourceId: string, signal?: AbortSignal): Promise<WikiSourceDetail> {
  return toSourceDetail(await apiFetch<WikiSourceDetailResponse>(backendApiPath(`/wiki-spaces/${encodeURIComponent(spaceId)}/sources/${encodeURIComponent(sourceId)}`), { signal }));
}

export async function getSourceDeleteImpact(spaceId: string, sourceId: string, signal?: AbortSignal): Promise<WikiSourceDeleteImpact> {
  return toDeleteImpact(await apiFetch<WikiSourceDeleteImpactResponse>(backendApiPath(`/wiki-spaces/${encodeURIComponent(spaceId)}/sources/${encodeURIComponent(sourceId)}/deletion-impact`), { signal }));
}

export async function createSource(spaceId: string, filename: string, content: string): Promise<WikiSource> {
  return toSource(await apiFetch<WikiSourceResponse>(backendApiPath(`/wiki-spaces/${encodeURIComponent(spaceId)}/sources`), {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename, content }),
  }));
}

export async function deleteSource(spaceId: string, sourceId: string): Promise<void> {
  await apiFetch<{ deleted: boolean }>(backendApiPath(`/wiki-spaces/${encodeURIComponent(spaceId)}/sources/${encodeURIComponent(sourceId)}`), { method: "DELETE" });
}

export async function ingestSources(spaceId: string, sourceIds: string[]): Promise<WikiIngestResult[]> {
  return (await apiFetch<WikiIngestResultResponse[]>(backendApiPath(`/wiki-spaces/${encodeURIComponent(spaceId)}/ingestions`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source_ids: sourceIds }),
  })).map(toResult);
}

export async function listJobs(spaceId: string, signal?: AbortSignal): Promise<WikiSourceJob[]> {
  return (await apiFetch<WikiSourceJobResponse[]>(backendApiPath(`/wiki-spaces/${encodeURIComponent(spaceId)}/jobs`), { signal })).map(toJob);
}

export async function retryJob(spaceId: string, jobId: string): Promise<WikiSourceJob> {
  return toJob(await apiFetch<WikiSourceJobResponse>(backendApiPath(`/wiki-spaces/${encodeURIComponent(spaceId)}/jobs/${encodeURIComponent(jobId)}/retries`), { method: "POST" }));
}

export async function cancelJob(spaceId: string, jobId: string): Promise<WikiSourceJob> {
  return toJob(await apiFetch<WikiSourceJobResponse>(backendApiPath(`/wiki-spaces/${encodeURIComponent(spaceId)}/jobs/${encodeURIComponent(jobId)}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "canceled" }),
  }));
}
