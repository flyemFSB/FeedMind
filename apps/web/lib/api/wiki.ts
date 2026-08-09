import { apiDelete, apiFetch, apiPatch, apiPost, apiPut, backendApiPath } from "./client";
import type {
  WikiBacklink,
  WikiGraph,
  WikiPageCreate,
  WikiPageListItem,
  WikiPageRead,
  WikiPageUpdate,
  WikiResolveResult,
  WikiSourceCreate,
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
export function createWikiSource(
  spaceId: string,
  payload: WikiSourceCreate,
): Promise<WikiSourceRead> {
  return apiPost(`/wiki/spaces/${spaceId}/sources/text`, payload);
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
