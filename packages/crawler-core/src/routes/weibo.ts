/**
 * 微博路由 handlers
 *
 * - 移动端 API (m.weibo.cn)
 * - Cookie 自动续期（过期时通过 AgentBrowser 获取新 cookie）
 * - 支持：用户微博列表、搜索
 */
import type { RouteHandler } from "../core/types.js";
import { registerRoute } from "../core/route-registry.js";
import { buildRssXml, buildGuid, toRfc2822 } from "../core/rss-builder.js";
import { weiboFetch } from "../core/weibo-utils.js";

const HTML_TAG_RE = /<[^>]+>/g;

function stripHtml(text: string): string {
  return (text || "").replace(HTML_TAG_RE, "").trim();
}

// ─── User（用户微博列表） ────────────────────────────────────────

const userHandler: RouteHandler = async ({ params, cookies, abortSignal, maxItems }) => {
  const uid = String(params.uid ?? "");

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  abortSignal.addEventListener("abort", onAbort, { once: true });

  try {
    const { data: json } = await weiboFetch<any>(
      `/container/getIndex?type=uid&value=${uid}&containerid=107603${uid}`,
      cookies,
    );

    const cards = json?.data?.cards ?? [];
    const items: any[] = [];

    for (const card of cards) {
      if (items.length >= maxItems) break;
      const mblog = card.mblog;
      if (!mblog) continue;

      const title = stripHtml(mblog.text || "").substring(0, 100);
      const author = mblog.user?.screen_name;
      const createdAt = mblog.created_at;

      items.push({
        title: title || "微博",
        description: mblog.text || "",
        link: `https://weibo.com/${uid}/${mblog.mid || mblog.id}`,
        guid: buildGuid("weibo", String(mblog.id)),
        pubDate: createdAt ? toRfc2822(createdAt) : new Date().toUTCString(),
        author: author,
        category: mblog.topic_struct?.map((t: any) => t.topic_title) || undefined,
      });

      // 处理转发微博
      if (mblog.retweeted_status) {
        const rt = mblog.retweeted_status;
        items.push({
          title: `转发：${stripHtml(rt.text || "").substring(0, 100)}`,
          description: rt.text || "",
          link: `https://weibo.com/${rt.user?.id}/${rt.mid || rt.id}`,
          guid: buildGuid("weibo", `rt_${rt.id}`),
          pubDate: rt.created_at ? toRfc2822(rt.created_at) : new Date().toUTCString(),
          author: rt.user?.screen_name,
        });
      }
    }

    return {
      rssXml: buildRssXml({
        title: `${items[0]?.author || uid} - 微博`,
        link: `https://weibo.com/u/${uid}`,
        description: `微博用户 ${uid} 的微博`,
        language: "zh-CN",
        items,
      }),
      metadata: { itemCount: items.length, platform: "weibo" },
    };
  } finally {
    abortSignal.removeEventListener("abort", onAbort);
  }
};

// ─── Search（搜索微博） ──────────────────────────────────────────

const searchHandler: RouteHandler = async ({ params, cookies, abortSignal, maxItems }) => {
  const keyword = String(params.keyword ?? "");

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  abortSignal.addEventListener("abort", onAbort, { once: true });

  try {
    const qs = new URLSearchParams({
      keyword,
      page: "1",
      count: String(Math.min(maxItems, 50)),
      typeall: "1",
      suball: "1",
    }).toString();

    const { data: json } = await weiboFetch<any>(`/search/statuses?${qs}`, cookies);

    const statuses = json?.data?.list ?? [];
    const items = statuses.slice(0, maxItems).map((st: any) => ({
      title: stripHtml(st.text || "").substring(0, 100),
      description: st.text || "",
      link: `https://weibo.com/${st.user?.id}/${st.mid || st.id}`,
      guid: buildGuid("weibo", String(st.id)),
      pubDate: st.created_at ? toRfc2822(st.created_at) : new Date().toUTCString(),
      author: st.user?.screen_name,
    }));

    return {
      rssXml: buildRssXml({
        title: `${keyword} - 微博搜索`,
        link: `https://s.weibo.com/weibo?q=${encodeURIComponent(keyword)}`,
        description: `微博搜索 - ${keyword}`,
        language: "zh-CN",
        items,
      }),
      metadata: { itemCount: items.length, platform: "weibo" },
    };
  } finally {
    abortSignal.removeEventListener("abort", onAbort);
  }
};

// ─── 注册路由 ────────────────────────────────────────────────────

registerRoute("wb/user", userHandler);
registerRoute("wb/search", searchHandler);
