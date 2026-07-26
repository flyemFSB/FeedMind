import { apiDelete, apiFetch, apiPatch, apiPost, apiPut, backendApiPath } from "./client";
import type {
  WikiBacklink,
  WikiGraph,
  WikiPageCreate,
  WikiPageListItem,
  WikiPageRead,
  WikiPageUpdate,
  WikiResolveResult,
  WikiSearchResponse,
  WikiSourceCreate,
  WikiSourceListItem,
  WikiSourceRead,
  WikiSpaceCreate,
  WikiSpaceListItem,
  WikiSpaceRead,
  WikiSpaceUpdate,
  IngestJob,
  LintResult,
} from "@feedmind/contracts";

// ─── Spaces ────────────────────────────────────────────────────
export function listWikiSpaces(): Promise<WikiSpaceListItem[]> {
  return apiFetch(backendApiPath("/wiki/spaces"));
}

export function createWikiSpace(payload: WikiSpaceCreate): Promise<WikiSpaceRead> {
  return apiPost("/wiki/spaces", payload);
}

export function getWikiSpace(spaceId: string): Promise<WikiSpaceRead> {
  return apiFetch(backendApiPath(`/wiki/spaces/${spaceId}`));
}

export function updateWikiSpace(spaceId: string, payload: WikiSpaceUpdate): Promise<WikiSpaceRead> {
  return apiPatch(`/wiki/spaces/${spaceId}`, payload);
}

export function deleteWikiSpace(spaceId: string): Promise<{ success: boolean }> {
  return apiDelete(`/wiki/spaces/${spaceId}`);
}

// ─── Pages ─────────────────────────────────────────────────────
export function listWikiPages(
  spaceId: string,
  params?: { type?: string; q?: string; limit?: number; offset?: number },
): Promise<{ items: WikiPageListItem[]; total: number }> {
  const searchParams = new URLSearchParams();
  if (params?.type) searchParams.set("type", params.type);
  if (params?.q) searchParams.set("q", params.q);
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.offset) searchParams.set("offset", String(params.offset));
  const qs = searchParams.toString();
  return apiFetch(backendApiPath(`/wiki/spaces/${spaceId}/pages${qs ? `?${qs}` : ""}`));
}

export function createWikiPage(spaceId: string, payload: WikiPageCreate): Promise<WikiPageRead> {
  return apiPost(`/wiki/spaces/${spaceId}/pages`, payload);
}

export function getWikiPage(spaceId: string, pageId: string): Promise<WikiPageRead> {
  return apiFetch(backendApiPath(`/wiki/spaces/${spaceId}/pages/${encodeURIComponent(pageId)}`));
}

export function updateWikiPage(
  spaceId: string,
  pageId: string,
  payload: WikiPageUpdate,
): Promise<WikiPageRead> {
  return apiPut(`/wiki/spaces/${spaceId}/pages/${encodeURIComponent(pageId)}`, payload);
}

export function deleteWikiPage(spaceId: string, pageId: string): Promise<void> {
  return apiDelete(`/wiki/spaces/${spaceId}/pages/${encodeURIComponent(pageId)}`);
}

export function resolveWikiLink(spaceId: string, target: string): Promise<WikiResolveResult> {
  return apiFetch(
    backendApiPath(`/wiki/spaces/${spaceId}/pages/resolve?target=${encodeURIComponent(target)}`),
  );
}

// ─── Backlinks ──────────────────────────────────────────────────
export function getWikiBacklinks(spaceId: string, pageId: string): Promise<WikiBacklink[]> {
  return apiFetch(
    backendApiPath(`/wiki/spaces/${spaceId}/pages/${encodeURIComponent(pageId)}/backlinks`),
  );
}

// ─── Sources ───────────────────────────────────────────────────
export function listWikiSources(
  spaceId: string,
  params?: { status?: string; limit?: number; offset?: number },
): Promise<{ items: WikiSourceListItem[]; total: number }> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set("status", params.status);
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.offset) searchParams.set("offset", String(params.offset));
  const qs = searchParams.toString();
  return apiFetch(backendApiPath(`/wiki/spaces/${spaceId}/sources${qs ? `?${qs}` : ""}`));
}

export function createWikiSource(
  spaceId: string,
  payload: WikiSourceCreate,
): Promise<WikiSourceRead> {
  return apiPost(`/wiki/spaces/${spaceId}/sources/text`, payload);
}

export function getWikiSource(spaceId: string, sourceId: string): Promise<WikiSourceRead> {
  return apiFetch(backendApiPath(`/wiki/spaces/${spaceId}/sources/${sourceId}`));
}

export function deleteWikiSource(
  spaceId: string,
  sourceId: string,
  mode: "detach" | "delete-orphans" = "detach",
): Promise<{ deleted_pages: number; updated_pages: number }> {
  return apiDelete(`/wiki/spaces/${spaceId}/sources/${sourceId}?mode=${mode}`);
}

export function previewDeleteImpact(
  spaceId: string,
  sourceId: string,
): Promise<{ willDelete: string[]; willUpdate: string[]; unaffected: number }> {
  return apiFetch(backendApiPath(`/wiki/spaces/${spaceId}/sources/${sourceId}/delete-impact`));
}

// ─── File Upload ────────────────────────────────────────────────
export function uploadWikiFile(
  spaceId: string,
  file: File,
): Promise<{ identity: string; title: string; kind: string; status: string }> {
  const formData = new FormData();
  formData.append("file", file);
  return apiFetch(backendApiPath(`/wiki/spaces/${spaceId}/sources/files`), {
    method: "POST",
    body: formData,
  });
}

// ─── Search ────────────────────────────────────────────────────
export function searchWiki(
  spaceId: string,
  query: string,
  topK?: number,
): Promise<WikiSearchResponse> {
  return apiPost(`/wiki/spaces/${spaceId}/search`, { query, topK });
}

// ─── Graph ─────────────────────────────────────────────────────
export function getWikiGraph(spaceId: string): Promise<WikiGraph> {
  return apiFetch(backendApiPath(`/wiki/spaces/${spaceId}/graph`));
}

export function getWikiGraphInsights(spaceId: string): Promise<{
  surprising: Array<{
    source: { id: string; label: string; type: string };
    target: { id: string; label: string; type: string };
    score: number;
    reasons: string[];
    key: string;
  }>;
  gaps: Array<{
    type: string;
    title: string;
    description: string;
    nodeIds: string[];
    suggestion: string;
  }>;
  nodeCount: number;
  edgeCount: number;
}> {
  return apiFetch(backendApiPath(`/wiki/spaces/${spaceId}/graph/insights`));
}

// ─── Direct Ingest ──────────────────────────────────────────────
export function runIngest(
  spaceId: string,
  sourcePath: string,
): Promise<{
  pagesCreated: number;
  pagesUpdated: number;
  warnings: string[];
  log: string[];
}> {
  return apiPost(`/wiki/spaces/${spaceId}/ingest`, { sourcePath });
}

// ─── Ingest Jobs ─────────────────────────────────────────────
export function listIngestJobs(spaceId: string, signal?: AbortSignal): Promise<IngestJob[]> {
  return apiFetch(backendApiPath(`/wiki/spaces/${spaceId}/jobs/ingest`), { signal });
}

export function cancelIngestJob(spaceId: string, jobId: string): Promise<void> {
  return apiPost(`/wiki/spaces/${spaceId}/jobs/${jobId}/cancel`, {});
}

export function retryIngestJob(spaceId: string, jobId: string): Promise<void> {
  return apiPost(`/wiki/spaces/${spaceId}/jobs/${jobId}/retry`, {});
}

// ─── Lint ──────────────────────────────────────────────────────
export function runLint(spaceId: string): Promise<LintResult[]> {
  return apiPost(`/wiki/spaces/${spaceId}/lint`, {});
}

export function getLintItems(spaceId: string): Promise<LintResult[]> {
  return apiFetch(backendApiPath(`/wiki/spaces/${spaceId}/lint-items`));
}
