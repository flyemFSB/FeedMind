/**
 * 微信读书路由 handlers（HTTP 直连模式）
 *
 * 借道微信读书网页版接口拉取书架中订阅的公众号文章：
 * - /web/shelf/sync  拉书架（含公众号），需登录 cookie
 * - /web/mp/articles 拉文章列表
 * - /web/mp/content  拉正文，提取 #js_content
 *
 * 全程 Node fetch 直连，不创建浏览器窗口：cookie 由 CookieCloud 扩展从
 * 用户 Chrome 实时同步（Electron 环境内登录的 cookie 会被风控标记，
 * articles 恒 -2041，直连用户 Chrome cookie 则正常）。
 */
import type { RouteHandler } from "../core/types.js";
import { registerRoute } from "../core/route-registry.js";
import { buildRssXml, buildGuid, fromUnixTimestamp } from "../core/rss-builder.js";
import * as cheerio from "cheerio";
import { CrawlerAuthError } from "../core/errors.js";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";

// 列表/正文请求间隔：微信读书风控严格，过快会触发限制（we-mp-rss 实测 1-2s 安全）
const GAP_LIST_MS = 1000;
const GAP_CONTENT_MS = 1500;

/** 书架中的公众号条目 */
interface WereadMp {
  name: string;
  bookId: string;
}

/** 单篇公众号文章 */
interface WereadArticle {
  reviewId: string;
  title: string;
  time: number;
  content: string;
  originalId?: string;
}

/** 单个公众号的抓取结果 */
interface WereadSourceResult {
  name: string;
  bookId: string;
  err?: string;
  list?: WereadArticle[];
}

interface ShelfResponse {
  errCode?: number;
  books?: Array<{ title?: string; bookId?: string }>;
}

interface ArticlesResponse {
  errCode?: number;
  reviews?: Array<{
    subReviews?: Array<{
      review?: {
        reviewId?: string;
        createTime?: number;
        mpInfo?: { title?: string; originalId?: string };
      };
    }>;
  }>;
}

async function fetchJson<T>(url: string, cookies: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json, text/plain, */*", Cookie: cookies },
    ...(signal ? { signal } : {}),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 拉书架中的公众号列表 */
async function fetchMps(cookies: string, signal?: AbortSignal): Promise<WereadMp[]> {
  const shelf = await fetchJson<ShelfResponse>(
    "https://weread.qq.com/web/shelf/sync?synckey=0&teenmode=0&album=1",
    cookies,
    signal,
  );
  // 非零 errCode 一律视为登录态异常（与 cookiecloud 校验的 mapWereadErrCode 同一语义），
  // 显式报错而非静默空书架——否则风控时页面表现成"没有订阅公众号"的假象
  if (shelf.errCode === -2010) throw new CrawlerAuthError("微信读书登录态已失效");
  if (shelf.errCode) {
    throw new CrawlerAuthError(
      `微信读书接口异常（errCode=${shelf.errCode}）：Cookie 可能被风控，请重新登录同步`,
    );
  }
  return (shelf.books ?? [])
    .filter((b) => String(b.bookId ?? "").startsWith("MP_WXS_"))
    .map((b) => ({ name: b.title ?? "(无名称)", bookId: b.bookId! }));
}

/** 拉单个公众号文章列表（最多 maxItems 篇） */
async function fetchArticles(
  bookId: string,
  cookies: string,
  maxItems: number,
  signal?: AbortSignal,
): Promise<{ list: WereadArticle[]; err?: string }> {
  const data = await fetchJson<ArticlesResponse>(
    `https://weread.qq.com/web/mp/articles?bookId=${encodeURIComponent(bookId)}&offset=0`,
    cookies,
    signal,
  );
  if (data.errCode) return { list: [], err: `errCode=${data.errCode}` };

  const list = (data.reviews ?? [])
    .flatMap((g) => g.subReviews ?? [])
    .map((s) => s.review)
    .filter((r): r is NonNullable<typeof r> => !!r && !!r.mpInfo?.title)
    .slice(0, maxItems)
    .map((r): WereadArticle => ({
      reviewId: r.reviewId ?? "",
      title: r.mpInfo!.title ?? "(无标题)",
      time: r.createTime ?? 0,
      content: "",
      ...(r.mpInfo?.originalId ? { originalId: r.mpInfo.originalId } : {}),
    }));
  return { list };
}

/** 拉单篇正文：/web/mp/content 返回文章 HTML 页，提取 #js_content 纯文本 */
async function fetchContent(
  reviewId: string,
  cookies: string,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch(
    `https://weread.qq.com/web/mp/content?reviewId=${encodeURIComponent(reviewId)}`,
    { headers: { "User-Agent": UA, Cookie: cookies }, ...(signal ? { signal } : {}) },
  );
  if (!res.ok) return "";
  const html = await res.text();
  const $ = cheerio.load(html);
  return ($("#js_content").text() ?? "").trim().slice(0, 20000);
}

// ─── Shelf（书架公众号文章） ───────────────────────────────────────

const shelfHandler: RouteHandler = async ({ params, cookies, abortSignal, maxItems }) => {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  abortSignal.addEventListener("abort", onAbort, { once: true });

  // 增量去重：已入库 guid 集合；每个公众号默认取最新 10 篇（per_mp 可调，1-20）
  const seenGuids = Array.isArray(params["seen_guids"])
    ? (params["seen_guids"] as string[]).filter(Boolean)
    : [];
  const perMp = Math.min(20, Math.max(1, Number(params["per_mp"]) || 10));
  // 指定单个公众号（bookId 形如 MP_WXS_xxx）；为空则拉取书架全部公众号
  const mpId = String(params["mp_id"] ?? "");
  const cookieStr = cookies ?? "";

  try {
    const mps = await fetchMps(cookieStr, controller.signal);
    const targetMps = mpId ? mps.filter((m) => m.bookId === mpId) : mps;

    if (targetMps.length === 0) {
      return {
        rssXml: buildRssXml({
          title: "微信读书公众号书架",
          link: "https://weread.qq.com/",
          description: mpId
            ? "指定公众号不在书架，或登录态失效"
            : "书架中未发现订阅的公众号，或登录态失效",
          language: "zh-CN",
          items: [],
        }),
        metadata: { itemCount: 0, platform: "weread" },
      };
    }

    const results: WereadSourceResult[] = [];
    for (const mp of targetMps) {
      try {
        const { list, err } = await fetchArticles(mp.bookId, cookieStr, perMp, controller.signal);
        if (err) {
          results.push({ name: mp.name, bookId: mp.bookId, err });
          await sleep(GAP_LIST_MS);
          continue;
        }

        // 只对新增文章抓正文（增量去重，与历史 CDP 脚本一致）
        const fresh: WereadArticle[] = [];
        for (const a of list) {
          const guid = `weread:${mp.bookId}:${a.reviewId}`;
          if (seenGuids.includes(guid)) continue;
          a.content = await fetchContent(a.reviewId, cookieStr, controller.signal);
          fresh.push(a);
          await sleep(GAP_CONTENT_MS);
        }

        results.push({ name: mp.name, bookId: mp.bookId, list: fresh });
      } catch (err) {
        results.push({ name: mp.name, bookId: mp.bookId, err: String(err).slice(0, 80) });
      }
      await sleep(GAP_LIST_MS);
    }

    // 网页版公众号文章接口整体失效（如 cookie 被风控标记）时，results 里每个源都带 err；
    // 显式报错让同步失败可见，而非静默返回空列表伪装成"没有新文章"。
    const errs = results.filter((r) => r.err);
    if (results.length > 0 && errs.length === results.length) {
      throw new Error(
        `微信读书公众号文章接口不可用（${errs[0]!.err}）：请检查 Cookie 是否来自最新登录`,
      );
    }

    const items = results
      .flatMap((src) => (src.list ?? []).map((a) => ({ src, a })))
      .slice(0, maxItems)
      .map(({ src, a }) => ({
        title: a.title,
        description: a.content,
        // 原文链接优先 mp.weixin.qq.com（articleId 即公众号原文 hash）；缺失时回退书架页
        link: a.originalId
          ? `https://mp.weixin.qq.com/s/${a.originalId}`
          : `https://weread.qq.com/web/mp/reader/${src.bookId}`,
        guid: buildGuid("weread", `${src.bookId}:${a.reviewId}`),
        pubDate: a.time ? fromUnixTimestamp(a.time) : new Date().toUTCString(),
        author: src.name,
        ...(src.name ? { category: [src.name] } : {}),
      }));

    return {
      rssXml: buildRssXml({
        title: "微信读书 - 书架公众号",
        link: "https://weread.qq.com/",
        description: `书架中 ${targetMps.length} 个订阅公众号的最新文章`,
        language: "zh-CN",
        items,
      }),
      metadata: { itemCount: items.length, platform: "weread" },
    };
  } finally {
    abortSignal.removeEventListener("abort", onAbort);
  }
};

// ─── List MPs（列出书架公众号） ──────────────────────────────────

const shelfMpsHandler: RouteHandler = async ({ cookies, abortSignal }) => {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  abortSignal.addEventListener("abort", onAbort, { once: true });

  try {
    const mps = await fetchMps(cookies ?? "", controller.signal);
    const items = mps.map((m) => ({
      title: m.name,
      description: m.bookId,
      link: "https://weread.qq.com/",
      guid: buildGuid("weread", `mp_${m.bookId}`),
      pubDate: new Date().toUTCString(),
    }));

    return {
      rssXml: buildRssXml({
        title: "微信读书书架公众号",
        link: "https://weread.qq.com/",
        description: "书架中订阅的公众号",
        language: "zh-CN",
        items,
      }),
      metadata: { itemCount: items.length, platform: "weread" },
    };
  } finally {
    abortSignal.removeEventListener("abort", onAbort);
  }
};

// ─── 注册路由 ────────────────────────────────────────────────────

registerRoute("weread/shelf", shelfHandler);
registerRoute("weread/mps", shelfMpsHandler);
