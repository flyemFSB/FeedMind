import type { RssSource } from "@feedmind/contracts";
import { apiFetch, backendApiPath, apiPost, apiDelete } from "./client";

export type { RssSource };

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

/** 保存 CookieCloud 扩展配置（UUID + 密码），供扩展推送时解密 */
export async function saveCookieCloudConfig(
  uuid: string,
  password: string,
): Promise<{ action: string }> {
  return apiPost("/cookiecloud/config", { uuid, password, crypto_type: "legacy" });
}

/** 查询已保存配置（仅返回 uuid/crypto_type，不返回密码——服务端加密存储） */
export async function getCookieCloudConfig(
  uuid: string,
): Promise<{ uuid: string; crypto_type: string }> {
  return apiFetch(backendApiPath(`/cookiecloud/config/${encodeURIComponent(uuid)}`));
}

// ─── 爬虫下拉选项 ───────────────────────────────────────────────

export async function listCrawlerOptions(listApi: string): Promise<CrawlerOption[]> {
  return apiFetch<CrawlerOption[]>(listApi);
}
