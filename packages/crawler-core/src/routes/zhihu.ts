/**
 * 知乎路由 handlers
 *
 * - x-zse-96 加密认证头
 * - d_c0 + __zse_ck cookie 管理
 * - 支持：回答列表、热榜、想法、文章、搜索
 */
import type { RouteHandler } from "../core/types.js";
import { registerRoute } from "../core/route-registry.js";
import { buildRssXml, buildGuid, fromUnixTimestamp } from "../core/rss-builder.js";
import { zhihuFetch } from "../core/zhihu-utils.js";

// ─── 辅助函数 ────────────────────────────────────────────────────

function cleanHtml(text: string): string {
  return (text || "").replace(/<[^>]+>/g, "").substring(0, 500);
}

function extractAuthor(obj: any): { id?: string; name?: string; avatar?: string } {
  if (!obj?.author) return {};
  return {
    id: obj.author.id || obj.author.url_token,
    name: obj.author.name,
    avatar: obj.author.avatar_url,
  };
}

// ─── Answers（问题回答列表） ─────────────────────────────────────

const answersHandler: RouteHandler = async ({ params, cookies, abortSignal, maxItems }) => {
  const questionId = String(params.question_id ?? "");

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  abortSignal.addEventListener("abort", onAbort, { once: true });

  try {
    const data = await zhihuFetch<any>(
      `/questions/${questionId}/answers?include=content,excerpt,author,voteup_count,comment_count,created_time,updated_time&limit=${Math.min(maxItems, 20)}&offset=0&order_by=created`,
      cookies,
      controller.signal,
    );

    const items = (data.data ?? []).slice(0, maxItems).map((item: any) => ({
      title: `${item.author?.name || "匿名用户"}的回答`,
      description: cleanHtml(item.excerpt || item.content || ""),
      link: `https://www.zhihu.com/question/${questionId}/answer/${item.id}`,
      guid: buildGuid("zhihu", `answer_${item.id}`),
      pubDate: fromUnixTimestamp(item.created_time),
      author: item.author?.name,
    }));

    return {
      rssXml: buildRssXml({
        title: `知乎回答 - 问题 ${questionId}`,
        link: `https://www.zhihu.com/question/${questionId}`,
        description: `知乎问题 ${questionId} 的回答`,
        language: "zh-CN",
        items,
      }),
      metadata: { itemCount: items.length, platform: "zhihu" },
    };
  } finally {
    abortSignal.removeEventListener("abort", onAbort);
  }
};

// ─── Hot（热榜） ─────────────────────────────────────────────────

const hotHandler: RouteHandler = async ({ cookies, abortSignal, maxItems }) => {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  abortSignal.addEventListener("abort", onAbort, { once: true });

  try {
    const data = await zhihuFetch<any>(
      "/zhihu/topstory/hot-list?limit=50",
      cookies,
      controller.signal,
    );

    const items = (data.data ?? []).slice(0, maxItems).map((item: any) => {
      const target = item.target || {};
      return {
        title: target.title || "",
        description: target.excerpt || target.detail || "",
        link: target.url || `https://www.zhihu.com/question/${target.id}`,
        guid: buildGuid("zhihu", `hot_${target.id}`),
        pubDate: target.created ? fromUnixTimestamp(target.created) : new Date().toUTCString(),
      };
    });

    return {
      rssXml: buildRssXml({
        title: "知乎热榜",
        link: "https://www.zhihu.com/hot",
        description: "知乎每日热榜",
        language: "zh-CN",
        items,
      }),
      metadata: { itemCount: items.length, platform: "zhihu" },
    };
  } finally {
    abortSignal.removeEventListener("abort", onAbort);
  }
};

// ─── Pin（想法） ─────────────────────────────────────────────────

const pinHandler: RouteHandler = async ({ params, cookies, abortSignal }) => {
  const pinId = String(params.pin_id ?? "");

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  abortSignal.addEventListener("abort", onAbort, { once: true });

  try {
    const data = await zhihuFetch<any>(`/pins/${pinId}`, cookies, controller.signal);

    const author = extractAuthor(data);
    return {
      rssXml: buildRssXml({
        title: `${author.name || "知乎用户"}的想法`,
        link: `https://www.zhihu.com/pin/${pinId}`,
        description: data.excerpt || "",
        language: "zh-CN",
        items: [
          {
            title: data.excerpt?.substring(0, 100) || "知乎想法",
            description: data.content?.join("\n") || data.excerpt || "",
            link: `https://www.zhihu.com/pin/${pinId}`,
            guid: buildGuid("zhihu", `pin_${pinId}`),
            pubDate: data.created_at
              ? fromUnixTimestamp(data.created_at)
              : new Date().toUTCString(),
            author: author.name,
          },
        ],
      }),
      metadata: { itemCount: 1, platform: "zhihu" },
    };
  } finally {
    abortSignal.removeEventListener("abort", onAbort);
  }
};

// ─── Article（专栏文章） ─────────────────────────────────────────

const articleHandler: RouteHandler = async ({ params, cookies, abortSignal }) => {
  const articleId = String(params.article_id ?? "");

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  abortSignal.addEventListener("abort", onAbort, { once: true });

  try {
    const data = await zhihuFetch<any>(
      `https://zhuanlan.zhihu.com/api/articles/${articleId}`,
      cookies,
      controller.signal,
    );

    const author = extractAuthor(data);
    return {
      rssXml: buildRssXml({
        title: data.title || "知乎专栏",
        link: `https://zhuanlan.zhihu.com/p/${articleId}`,
        description: data.excerpt || "",
        language: "zh-CN",
        items: [
          {
            title: data.title || "",
            description: cleanHtml(data.content || data.excerpt || ""),
            link: `https://zhuanlan.zhihu.com/p/${articleId}`,
            guid: buildGuid("zhihu", `article_${articleId}`),
            pubDate: data.created_time
              ? fromUnixTimestamp(data.created_time)
              : new Date().toUTCString(),
            author: author.name,
          },
        ],
      }),
      metadata: { itemCount: 1, platform: "zhihu" },
    };
  } finally {
    abortSignal.removeEventListener("abort", onAbort);
  }
};

// ─── Search（搜索） ──────────────────────────────────────────────

const searchHandler: RouteHandler = async ({ params, cookies, abortSignal, maxItems }) => {
  const keyword = String(params.keyword ?? "");

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  abortSignal.addEventListener("abort", onAbort, { once: true });

  try {
    const qs = new URLSearchParams({
      q: keyword,
      search_source: "Normal",
      page: "1",
      limit: String(Math.min(maxItems, 20)),
    }).toString();

    const data = await zhihuFetch<any>(`/search_v3?${qs}`, cookies, controller.signal);

    const items = (data.data ?? [])
      .filter((item: any) => item.type === "answer" || item.type === "article")
      .slice(0, maxItems)
      .map((item: any) => {
        const obj = item.object || {};
        const author = extractAuthor(obj);
        const qTitle = obj.question?.title || obj.title || "";
        return {
          title: qTitle,
          description: cleanHtml(obj.excerpt || obj.content || ""),
          link: obj.url || `https://www.zhihu.com/question/${obj.question?.id}/answer/${obj.id}`,
          guid: buildGuid("zhihu", `search_${obj.id}`),
          pubDate: obj.created_time
            ? fromUnixTimestamp(obj.created_time)
            : new Date().toUTCString(),
          author: author.name,
        };
      });

    return {
      rssXml: buildRssXml({
        title: `${keyword} - 知乎搜索`,
        link: `https://www.zhihu.com/search?q=${encodeURIComponent(keyword)}`,
        description: `知乎搜索 - ${keyword}`,
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

registerRoute("zh/answers", answersHandler);
registerRoute("zh/hot", hotHandler);
registerRoute("zh/pin", pinHandler);
registerRoute("zh/article", articleHandler);
registerRoute("zh/search", searchHandler);
