import type { FeedItem, RssSource } from "@feedmind/contracts";
import { apiFetch, backendApiPath } from "./client";

export type { FeedItem, RssSource };

export interface FeedSyncResult {
  inserted?: number;
  failed?: number;
}

// 列表一次性拉全量（虚拟化渲染，无分页 UI）：上限需容纳全部订阅源条目，否则沉底来源被截断看不到
const FEED_PAGE_SIZE = 5000;

export async function listFeeds(): Promise<FeedItem[]> {
  const res = await apiFetch<{ data: FeedItem[] }>(
    backendApiPath(`/feeds?limit=${FEED_PAGE_SIZE}`),
  );
  return res.data;
}

export async function syncFeeds(): Promise<FeedSyncResult> {
  return apiFetch<FeedSyncResult>(backendApiPath("/feeds/sync"), { method: "POST" });
}

export async function markFeedRead(id: string): Promise<void> {
  await apiFetch<{ action: string }>(backendApiPath(`/feeds/${id}/read`), { method: "POST" });
}

export async function deleteFeeds(ids: string[]): Promise<void> {
  await apiFetch(backendApiPath("/feeds"), {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ids }),
  });
}
