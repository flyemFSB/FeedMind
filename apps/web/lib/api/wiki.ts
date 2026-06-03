import { apiFetch, backendApiPath } from "./client";
import type {
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
  WikiSpaceUpdate,
} from "@feedmind/contracts";

// ─── Spaces ────────────────────────────────────────────────────
export function listWikiSpaces(): Promise<WikiSpaceListItem[]> {
  return apiFetch(backendApiPath("/wiki/spaces"));
}

export function createWikiSpace(
  payload: WikiSpaceCreate,
): Promise<WikiSpaceRead> {
  return apiFetch(backendApiPath("/wiki/spaces"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function getWikiSpace(spaceId: string): Promise<WikiSpaceRead> {
  return apiFetch(backendApiPath(`/wiki/spaces/${spaceId}`));
}

export function updateWikiSpace(
  spaceId: string,
  payload: WikiSpaceUpdate,
): Promise<WikiSpaceRead> {
  return apiFetch(backendApiPath(`/wiki/spaces/${spaceId}`), {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
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
  return apiFetch(
    backendApiPath(`/wiki/spaces/${spaceId}/pages${qs ? `?${qs}` : ""}`),
  );
}

export function createWikiPage(
  spaceId: string,
  payload: WikiPageCreate,
): Promise<WikiPageRead> {
  return apiFetch(backendApiPath(`/wiki/spaces/${spaceId}/pages`), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function getWikiPage(
  spaceId: string,
  pageId: string,
): Promise<WikiPageRead> {
  return apiFetch(backendApiPath(`/wiki/spaces/${spaceId}/pages/${pageId}`));
}

export function updateWikiPage(
  spaceId: string,
  pageId: string,
  payload: WikiPageUpdate,
): Promise<WikiPageRead> {
  return apiFetch(backendApiPath(`/wiki/spaces/${spaceId}/pages/${pageId}`), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function deleteWikiPage(
  spaceId: string,
  pageId: string,
): Promise<void> {
  return apiFetch(backendApiPath(`/wiki/spaces/${spaceId}/pages/${pageId}`), {
    method: "DELETE",
  });
}

export function resolveWikiLink(
  spaceId: string,
  target: string,
): Promise<WikiResolveResult> {
  return apiFetch(
    backendApiPath(
      `/wiki/spaces/${spaceId}/pages/resolve?target=${encodeURIComponent(target)}`,
    ),
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
  return apiFetch(
    backendApiPath(
      `/wiki/spaces/${spaceId}/sources${qs ? `?${qs}` : ""}`,
    ),
  );
}

export function createWikiSource(
  spaceId: string,
  payload: WikiSourceCreate,
): Promise<WikiSourceRead> {
  return apiFetch(backendApiPath(`/wiki/spaces/${spaceId}/sources/text`), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function getWikiSource(
  spaceId: string,
  sourceId: string,
): Promise<WikiSourceRead> {
  return apiFetch(
    backendApiPath(`/wiki/spaces/${spaceId}/sources/${sourceId}`),
  );
}

export function deleteWikiSource(
  spaceId: string,
  sourceId: string,
  mode: "detach" | "delete-orphans" = "detach",
): Promise<{ deleted_pages: number; updated_pages: number }> {
  return apiFetch(
    backendApiPath(
      `/wiki/spaces/${spaceId}/sources/${sourceId}?mode=${mode}`,
    ),
    { method: "DELETE" },
  );
}
