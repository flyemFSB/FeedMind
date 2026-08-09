import { apiFetch, backendApiPath, apiPost, apiDelete } from "./client";

// ─── 类型（来自后端 /feeds 与 /rss-sources 响应） ───────────────

export interface FeedItem {
  id: string;
  sourceId: string;
  title: string;
  description: string | null;
  link: string | null;
  guid: string;
  author: string | null;
  category: string | null;
  image: string | null;
  pubDate: string | null;
  fetchedAt: string;
  isRead: number;
  createdAt: string;
}

export interface RssSource {
  id: string;
  type: "rss" | "social";
  platform: string | null;
  route: string | null;
  url: string;
  title: string;
  params: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** cookie_store 明文 cookie 行（登录态校验结果） */
export interface CookieStoreRow {
  uuid: string;
  platform: string;
  cookies: string;
  valid: boolean | null;
  checkedAt: string | null;
}

/** 爬虫下拉列表选项（B站收藏夹 / 知乎收藏夹 / 微信读书公众号） */
export interface CrawlerOption {
  name: string;
  id: string;
}

export interface FeedSyncResult {
  inserted?: number;
  failed?: number;
}

// ─── Feeds ──────────────────────────────────────────────────────

const FEED_PAGE_SIZE = 100;

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

// ─── RSS 订阅源 ─────────────────────────────────────────────────

export async function listRssSources(): Promise<RssSource[]> {
  return apiFetch<RssSource[]>(backendApiPath("/rss-sources"));
}

export function addRssSource(body: object): Promise<unknown> {
  return apiPost("/rss-sources", body);
}

export function removeRssSource(id: string): Promise<unknown> {
  return apiDelete(`/rss-sources/${encodeURIComponent(id)}`);
}

// ─── Cookie 管理 ───────────────────────────────────────────────

export async function listCookies(): Promise<CookieStoreRow[]> {
  return apiFetch<CookieStoreRow[]>(backendApiPath("/cookiecloud/cookies"));
}

export interface CookieCheckResult {
  valid: boolean | null;
  supported: boolean;
}

export async function checkPlatformCookie(platform: string): Promise<CookieCheckResult> {
  return apiFetch<CookieCheckResult>(backendApiPath(`/cookiecloud/check/${platform}`), {
    method: "POST",
  });
}

/** 应用内浏览器登录：Electron 打开登录窗口，用户完成后捕获会话 Cookie 入库 */
export async function browserLogin(platform: string): Promise<{ valid: boolean }> {
  return apiFetch<{ valid: boolean }>(backendApiPath(`/cookiecloud/login/${platform}`), {
    method: "POST",
  });
}

// ─── 爬虫下拉选项 ───────────────────────────────────────────────

export async function listCrawlerOptions(listApi: string): Promise<CrawlerOption[]> {
  return apiFetch<CrawlerOption[]>(listApi);
}
