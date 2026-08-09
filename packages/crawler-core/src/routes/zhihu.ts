/**
 * 知乎路由 handlers（仅收藏夹）
 *
 * 收藏夹相关接口为公开 API，无需 x-zse-96 签名，带 Cookie + Referer 即可。
 */
import type { RouteHandler } from "../core/types.js";
import { registerRoute } from "../core/route-registry.js";
import { buildRssXml, buildGuid, fromUnixTimestamp } from "../core/rss-builder.js";
import { CrawlerAuthError } from "../core/errors.js";

/** 知乎收藏夹条目 */
interface ZhihuCollectionItem {
  content: {
    type?: string;
    title?: string;
    url?: string;
    content?: string;
    question?: { title?: string };
    updated?: number;
    updated_time?: number;
  };
}

// ─── 辅助函数 ────────────────────────────────────────────────────

function cleanHtml(text: string): string {
  return (text || "").replace(/<[^>]+>/g, "").substring(0, 500);
}

// ─── Collection（收藏夹） ────────────────────────────────────────

const collectionHandler: RouteHandler = async ({ params, cookies, abortSignal, maxItems }) => {
  const id = String(params["id"] ?? "");

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  abortSignal.addEventListener("abort", onAbort, { once: true });

  try {
    // 收藏夹 items 是公开 API，无需 x-zse-96 签名（加签名反而 404），带 Cookie + Referer 即可
    const res = await fetch(
      `https://www.zhihu.com/api/v4/collections/${id}/items?offset=0&limit=${Math.min(maxItems, 20)}`,
      {
        headers: {
          Cookie: cookies ?? "",
          Referer: `https://www.zhihu.com/collection/${id}`,
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "zh-CN,zh;q=0.9",
        },
        signal: controller.signal,
      },
    );
    if (!res.ok) throw new Error(`知乎 API ${res.status}: ${res.statusText}`);
    const json = (await res.json()) as { data?: ZhihuCollectionItem[] };

    const items = (json.data ?? []).slice(0, maxItems).map((item, i) => {
      const c = item.content ?? {};
      const isArticle = c.type === "article" || c.type === "zvideo";
      const title = isArticle ? (c.title ?? "") : (c.question?.title ?? "");
      const ts = c.type === "article" ? c.updated : c.updated_time;
      return {
        title: title || "知乎收藏",
        description: cleanHtml(typeof c.content === "string" ? c.content : ""),
        link: c.url ?? `https://www.zhihu.com/collection/${id}`,
        guid: buildGuid("zhihu", `collection_${id}_${i}`),
        pubDate: ts ? fromUnixTimestamp(ts) : new Date().toUTCString(),
      };
    });

    return {
      rssXml: buildRssXml({
        title: `知乎收藏夹 ${id}`,
        link: `https://www.zhihu.com/collection/${id}`,
        description: `知乎收藏夹 ${id} 的内容`,
        language: "zh-CN",
        items,
      }),
      metadata: { itemCount: items.length, platform: "zhihu" },
    };
  } finally {
    abortSignal.removeEventListener("abort", onAbort);
  }
};

// ─── Collections List（当前登录用户收藏夹列表） ───────────────────

const collectionsHandler: RouteHandler = async ({ cookies, abortSignal }) => {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  abortSignal.addEventListener("abort", onAbort, { once: true });

  try {
    // /me 与收藏夹列表均为公开接口，无需 x-zse-96 签名，带 Cookie + Referer 即可
    const headers = {
      Cookie: cookies ?? "",
      Referer: "https://www.zhihu.com/",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "zh-CN,zh;q=0.9",
    };

    const meRes = await fetch("https://www.zhihu.com/api/v4/me", {
      headers,
      signal: controller.signal,
    });
    if (!meRes.ok) {
      // 401 表示登录态失效，区别于普通网络错误
      if (meRes.status === 401) throw new CrawlerAuthError("知乎登录态已失效");
      throw new Error(`知乎 API ${meRes.status}: ${meRes.statusText}`);
    }
    const me = (await meRes.json()) as { url_token?: string };

    if (!me.url_token) {
      throw new CrawlerAuthError("知乎登录态已失效（未获取到登录用户）");
    }

    const colsRes = await fetch(
      `https://api.zhihu.com/people/${me.url_token}/collections?limit=50`,
      { headers, signal: controller.signal },
    );
    if (!colsRes.ok) throw new Error(`知乎 API ${colsRes.status}: ${colsRes.statusText}`);
    const cols = (await colsRes.json()) as {
      data?: { id?: number; title?: string; updated_time?: number }[];
    };

    const items = (cols.data ?? []).map((c) => ({
      title: c.title ?? "未命名收藏夹",
      description: String(c.id ?? ""),
      link: `https://www.zhihu.com/collection/${c.id}`,
      guid: buildGuid("zhihu", `collection_${c.id}`),
      pubDate: c.updated_time ? fromUnixTimestamp(c.updated_time) : new Date().toUTCString(),
    }));

    return {
      rssXml: buildRssXml({
        title: "知乎收藏夹列表",
        link: `https://www.zhihu.com/people/${me.url_token}/collections`,
        description: "当前登录用户的收藏夹",
        language: "zh-CN",
        items,
      }),
      metadata: { itemCount: items.length, platform: "zhihu" },
    };
  } finally {
    abortSignal.removeEventListener("abort", onAbort);
  }
};

// ─── 注册路由 ────────────────────────────────────────────────────

registerRoute("zh/collection", collectionHandler);
registerRoute("zh/collections", collectionsHandler);
