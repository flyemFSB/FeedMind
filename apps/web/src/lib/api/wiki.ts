import { apiDelete, apiFetch, apiPost, apiPut, backendApiPath } from "./client";
import type { IngestJob } from "@feedmind/contracts";
import type {
  WikiBacklink,
  WikiGraph,
  WikiPageCreate,
  WikiPageListItem,
  WikiPageRead,
  WikiPageUpdate,
  WikiResolveResult,
  WikiSourceCreate,
  WikiSourceListItem,
  WikiSourceRead,
  WikiSpaceCreate,
  WikiSpaceListItem,
  WikiSpaceRead,
} from "@feedmind/contracts";

// ─── Wiki 空间接口 ──────────────────────────────────────────
export function listWikiSpaces(): Promise<WikiSpaceListItem[]> {
  return apiFetch(backendApiPath("/wiki/spaces"));
}

export function createWikiSpace(payload: WikiSpaceCreate): Promise<WikiSpaceRead> {
  return apiPost("/wiki/spaces", payload);
}

export function deleteWikiSpace(spaceId: string): Promise<{ success: boolean }> {
  return apiDelete(`/wiki/spaces/${spaceId}`);
}

// ─── Wiki 概念页面接口 ──────────────────────────────────────
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

export function resolveWikiLink(spaceId: string, target: string): Promise<WikiResolveResult> {
  return apiFetch(
    backendApiPath(`/wiki/spaces/${spaceId}/pages/resolve?target=${encodeURIComponent(target)}`),
  );
}

// ─── 反向链接接口 ───────────────────────────────────────────
export function getWikiBacklinks(spaceId: string, pageId: string): Promise<WikiBacklink[]> {
  return apiFetch(
    backendApiPath(`/wiki/spaces/${spaceId}/pages/${encodeURIComponent(pageId)}/backlinks`),
  );
}

// ─── 知识来源接口 ───────────────────────────────────────────
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

// ─── 文件上传接口 ───────────────────────────────────────────
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

// ─── 知识图谱接口 ───────────────────────────────────────────
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

// ─── Ingest Jobs（导入过程展示：来源行内轮询任务状态/进度）──────
export function listIngestJobs(spaceId: string): Promise<IngestJob[]> {
  return apiFetch(backendApiPath(`/wiki/spaces/${spaceId}/jobs/ingest`));
}

export function enqueueIngestJob(
  spaceId: string,
  sourcePath: string,
  folderContext?: string,
): Promise<IngestJob> {
  return apiPost(`/wiki/spaces/${spaceId}/jobs/ingest`, { sourcePath, folderContext });
}

export function cancelIngestJob(spaceId: string, jobId: string): Promise<{ success: boolean }> {
  return apiPost(`/wiki/spaces/${spaceId}/jobs/${jobId}/cancel`, {});
}
