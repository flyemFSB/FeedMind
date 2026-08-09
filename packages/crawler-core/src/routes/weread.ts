/**
 * 微信读书路由 handlers
 *
 * 借道微信读书网页版接口拉取书架中订阅的公众号文章：
 * - /web/shelf/sync     拉书架（含公众号），任意页面上下文可调，需登录 cookie
 * - /web/mp/articles    拉文章列表，必须在阅读器页（/web/mp/reader/）上下文请求，否则 -2041
 * - /web/mp/content     拉正文，提取 #js_content，只需 cookie
 *
 * 全程在微信读书同域内 fetch，不打开 mp.weixin.qq.com，规避验证码。
 */
import type { RouteHandler } from "../core/types.js";
import { registerRoute } from "../core/route-registry.js";
import { buildRssXml, buildGuid, fromUnixTimestamp } from "../core/rss-builder.js";
import {
  createBrowser,
  closeBrowser,
  ensureCookies,
  blockHeavyResources,
} from "../core/browser.js";
import { CrawlerAuthError } from "../core/errors.js";

/** 书架中的公众号条目 */
interface WereadMp {
  name: string;
  bookId: string;
  hash?: string | null;
}

/** 完整抓取脚本返回的单条结果 */
interface WereadArticleResult {
  reviewId: string;
  originalId: string;
  title: string;
  time: number;
  content: string;
}

interface WereadSourceResult {
  name: string;
  bookId?: string;
  err?: string;
  list?: WereadArticleResult[];
}

interface WereadFetchResult {
  onReader: boolean;
  mps: WereadMp[];
  results: WereadSourceResult[];
}

/**
 * 轻量书架脚本：只拉书架并提取公众号（含阅读器页 hash）。
 * 用于在导航到阅读器页之前确定目标 URL。
 */
const SHELF_SCRIPT = `(async function(){
  var res = await fetch('/web/shelf/sync?synckey=0&teenmode=0&album=1', { credentials: 'include' });
  var o = await res.json();
  // 仅 -2010（登录态失效）判失效；-2041（上下文错误）等业务码不代表 Cookie 失效
  var authFailed = !res.ok || o.errCode === -2010;
  var mps = (o.books || []).filter(function(b){ return String(b.bookId || '').indexOf('MP_WXS_') === 0; })
    .map(function(b){
      var m = String(b.deepLink || '').match(/[?&]v=([^&]+)/);
      return { name: b.title, bookId: b.bookId, hash: m ? m[1] : null };
    });
  return JSON.stringify({ authFailed: authFailed, errCode: o.errCode || 0, mps: mps });
})()`;

/**
 * 完整抓取脚本：书架 → 逐个公众号文章列表 + 正文。
 * 必须在阅读器页上下文执行（articles 请求依赖页面上下文/签名）。
 * @param maxPerMp 每个公众号最多抓取的正文篇数
 * @param seenGuids 已入库的 guid 集合，命中则跳过（增量去重）
 * @param mpIds 只抓取指定公众号 bookId；为空则抓取书架全部
 */
function buildFetchAllScript(maxPerMp: number, seenGuids: string[], mpIds: string[] = []): string {
  return `(async function(){
  var sleep = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };
  var GAP_MP = 3000, GAP_CONTENT = 2000, MAX_PER_MP = ${maxPerMp};
  var SEEN = new Set(${JSON.stringify(seenGuids)});
  var ONLY = ${JSON.stringify(mpIds)};

  // 书架：过滤公众号（bookId 以 MP_WXS_ 开头）
  var shelfRes = await fetch('/web/shelf/sync?synckey=0&teenmode=0&album=1', { credentials: 'include' });
  var shelf = await shelfRes.json();
  var mps = (shelf.books || []).filter(function(b){ return String(b.bookId || '').indexOf('MP_WXS_') === 0; })
    .map(function(b){
      var m = String(b.deepLink || '').match(/[?&]v=([^&]+)/);
      return { name: b.title, bookId: b.bookId, hash: m ? m[1] : null };
    });
  if (ONLY.length) mps = mps.filter(function(m){ return ONLY.indexOf(m.bookId) >= 0; });

  var out = [];
  for (var i = 0; i < mps.length; i++){
    var mp = mps[i];
    var list = [];
    try {
      var r = await fetch('/web/mp/articles?bookId=' + encodeURIComponent(mp.bookId) + '&offset=0', { credentials: 'include' });
      var o = await r.json();
      if (o.errCode){ out.push({ name: mp.name, err: 'errCode=' + o.errCode }); await sleep(GAP_MP); continue; }
      (o.reviews || []).forEach(function(grp){
        (grp.subReviews || []).forEach(function(s){
          var rr = s.review || {}, mi = rr.mpInfo || {};
          if (!mi.title) return;
          list.push({ reviewId: rr.reviewId || '', originalId: mi.originalId || '', title: mi.title, time: rr.createTime || grp.createTime || 0 });
        });
      });
    } catch(e){
      out.push({ name: mp.name, err: String(e).slice(0, 80) });
      await sleep(GAP_MP);
      continue;
    }

    // 正文：/web/mp/content 提取 #js_content 纯文本，最多 MAX_PER_MP 篇；只对新增文章抓正文
    var limited = list.slice(0, MAX_PER_MP);
    var fresh = [];
    for (var j = 0; j < limited.length; j++){
      var guid = 'weread:' + mp.bookId + ':' + limited[j].reviewId;
      if (SEEN.has(guid)) continue;
      try {
        var cr = await fetch('/web/mp/content?reviewId=' + encodeURIComponent(limited[j].reviewId), { credentials: 'include' });
        var html = await cr.text();
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var node = doc.querySelector('#js_content');
        limited[j].content = (node ? node.innerText : '').trim().slice(0, 20000);
      } catch(e){
        limited[j].content = '';
      }
      fresh.push(limited[j]);
      await sleep(GAP_CONTENT);
    }

    out.push({ name: mp.name, bookId: mp.bookId, list: fresh });
    await sleep(GAP_MP);
  }
  return JSON.stringify({ onReader: location.pathname.indexOf('/web/mp/reader/') === 0, mps: mps, results: out });
})()`;
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

  try {
    const page = await createBrowser();
    try {
      // 屏蔽非关键资源，加快加载
      await blockHeavyResources(page);

      await ensureCookies(page, cookies, "weread.qq.com");

      // 先访问首页拿书架（确定公众号与阅读器页 URL）
      await page.goto("https://weread.qq.com/", { waitUntil: "domcontentloaded", timeout: 60_000 });
      const shelfRaw = await page.evaluate<string>(SHELF_SCRIPT).catch(() => {
        // 页面加载/脚本失败：抛错让任务失败，而非静默返回空书架误导用户
        throw new Error("微信读书书架页面加载失败");
      });
      const shelfData = JSON.parse(shelfRaw) as { mps?: WereadMp[]; authFailed?: boolean };
      if (shelfData.authFailed) throw new CrawlerAuthError("微信读书登录态已失效");
      const mps = shelfData.mps ?? [];
      const targetMps = mpId ? mps.filter((m) => m.bookId === mpId) : mps;

      // 未登录、书架无公众号或指定公众号不在书架
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

      // 导航到任一公众号阅读器页，获得 articles 请求所需的页面上下文
      const targetHash = targetMps.find((m) => m.hash)?.hash;
      if (targetHash) {
        await page.goto(`https://weread.qq.com/web/mp/reader/${targetHash}`, {
          waitUntil: "domcontentloaded",
          timeout: 60_000,
        });
      }

      // 在阅读器页上下文执行完整抓取（增量去重 + 每号 perMp 篇 + 可选指定公众号）
      const evaluatePromise = page.evaluate<string>(
        buildFetchAllScript(perMp, seenGuids, mpId ? [mpId] : []),
        {
          timeout: 240_000,
        },
      );
      // 取消时提前结束等待，尽快释放爬虫窗口；页面上下文随后被 closeBrowser 导航销毁，吞掉 evaluate 后续拒绝
      const raw = await Promise.race([
        evaluatePromise,
        new Promise<never>((_, reject) => {
          const onCancel = () => reject(new Error("任务已取消"));
          if (controller.signal.aborted) onCancel();
          else controller.signal.addEventListener("abort", onCancel, { once: true });
        }),
      ]).catch((err) => {
        evaluatePromise.catch(() => {});
        throw err;
      });
      const data = JSON.parse(raw) as WereadFetchResult;

      const items = (data.results ?? [])
        .flatMap((src) => (src.list ?? []).map((a) => ({ src, a })))
        .slice(0, maxItems)
        .map(({ src, a }) => ({
          title: a.title,
          description: a.content,
          link: a.originalId
            ? `https://mp.weixin.qq.com/s/${a.originalId}`
            : `https://weread.qq.com/web/mp/reader/${data.mps.find((m) => m.bookId === src.bookId)?.hash ?? ""}`,
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
      await closeBrowser();
    }
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
    const page = await createBrowser();
    try {
      await blockHeavyResources(page);

      await ensureCookies(page, cookies, "weread.qq.com");

      await page.goto("https://weread.qq.com/", { waitUntil: "domcontentloaded", timeout: 60_000 });
      const shelfRaw = await page.evaluate<string>(SHELF_SCRIPT).catch(() => {
        // 页面加载/脚本失败：抛错让任务失败，而非静默返回空列表误导用户
        throw new Error("微信读书书架页面加载失败");
      });
      const data = JSON.parse(shelfRaw) as { mps?: WereadMp[]; authFailed?: boolean };
      if (data.authFailed) throw new CrawlerAuthError("微信读书登录态已失效");
      const mps = data.mps ?? [];

      const items = mps.map((m) => ({
        title: m.name,
        description: m.bookId,
        link: m.hash ? `https://weread.qq.com/web/mp/reader/${m.hash}` : "https://weread.qq.com/",
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
      await closeBrowser();
    }
  } finally {
    abortSignal.removeEventListener("abort", onAbort);
  }
};

// ─── 注册路由 ────────────────────────────────────────────────────

registerRoute("weread/shelf", shelfHandler);
registerRoute("weread/mps", shelfMpsHandler);
