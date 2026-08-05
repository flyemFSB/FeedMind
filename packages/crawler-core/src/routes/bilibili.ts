/**
 * B站 路由 handlers
 *
 * - WBI 签名：从 nav API + JS 排列表获取 wbiVerifyString
 * - 反爬探针：dm_img_list, dm_img_str, dm_cover_img_str
 * - Cookie 认证必需
 * - -352 错误时降级到 AgentBrowser 兜底
 */
import { load } from "cheerio";
import type { RouteHandler } from "../core/types.js";
import { registerRoute } from "../core/route-registry.js";
import { buildRssXml, buildGuid, fromUnixTimestamp } from "../core/rss-builder.js";
import {
  getWbiVerifyString,
  addWbiVerifyInfo,
  addDmVerifyInfo,
  getDmImgList,
} from "../core/wbi-sign.js";
import { createBrowser, closeBrowser, injectCookies } from "../core/browser.js";

/** B站 API 通用响应结构 */
interface BiliApiResponse<T = unknown> {
  code: number;
  message?: string;
  data: T;
}

/** B站视频列表项 */
interface BiliVideo {
  bvid?: string;
  aid?: number;
  title?: string;
  description?: string;
  author?: string;
  pic?: string;
  created?: number;
  pubdate?: number;
  tag?: string;
}

/** B站视频详情 */
interface BiliVideoDetail {
  bvid?: string;
  title?: string;
  desc?: string;
  pic?: string;
  pubdate?: number;
  owner?: { name?: string };
}

/** B站搜索结果项 */
interface BiliSearchResult {
  bvid?: string;
  title?: string;
  description?: string;
  author?: string;
  pubdate?: number;
  tag?: string;
  pic?: string;
}

/** B站收藏夹视频 */
interface BiliFavMedia {
  id?: number;
  bvid?: string;
  title?: string;
  intro?: string;
  cover?: string;
  fav_time?: number;
  upper?: { name?: string };
}

/** B站收藏夹信息 */
interface BiliFavFolder {
  id?: number;
  title?: string;
}

const API_BASE = "https://api.bilibili.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

/** 从 cookie 字符串提取指定 key 的值 */
function extractCookieValue(cookies: string | undefined, key: string): string {
  if (!cookies) return "";
  for (const part of cookies.split(";")) {
    const t = part.trim();
    if (t.startsWith(key + "=")) return t.slice(key.length + 1);
  }
  return "";
}

/** -352 验证码错误标记 */
class BiliCaptchaError extends Error {
  constructor() {
    super("BILI API -352 captcha");
    this.name = "BiliCaptchaError";
  }
}

/**
 * 带 WBI 签名 + 反爬探针的 B站 API 调用
 */
async function biliFetch<T>(
  path: string,
  params: Record<string, string>,
  cookies?: string,
  signal?: AbortSignal,
): Promise<T> {
  const wbiVerifyString = await getWbiVerifyString(signal);
  let qs = new URLSearchParams(params).toString();
  qs = addDmVerifyInfo(qs, getDmImgList());
  qs = addWbiVerifyInfo(qs, wbiVerifyString);

  const url = `${API_BASE}${path}?${qs}`;
  const headers: Record<string, string> = {
    "User-Agent": UA,
    Referer: "https://www.bilibili.com",
    "Accept-Language": "zh-CN,zh;q=0.9",
  };
  if (cookies) headers.Cookie = cookies;

  const res = await fetch(url, { headers, signal });
  if (!res.ok) throw new Error(`BILI API ${res.status}`);

  const json = (await res.json()) as BiliApiResponse<T>;
  if (json.code === -352) {
    throw new BiliCaptchaError();
  }
  if (json.code !== 0) {
    throw new Error(`BILI API error: ${json.code} - ${json.message ?? "unknown"}`);
  }
  return json.data;
}

/**
 * AgentBrowser 降级：导航到 B站页面，提取 window.__INITIAL_STATE__ 中的关键数据
 */
async function biliBrowserFetch(
  url: string,
  evaluateScript: string,
  cookies?: string,
): Promise<unknown> {
  const browser = await createBrowser();
  try {
    await browser.ensureReady();
    const manager = await browser.getManagerForThread();
    const page = manager.getPage();
    await injectCookies(page, cookies, ".bilibili.com");
    await page.route("**/*", (route) => {
      const type = route.request().resourceType();
      if (["image", "media", "font", "stylesheet"].includes(type)) {
        void route.abort();
      } else {
        void route.continue();
      }
    });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    return await page.evaluate(evaluateScript);
  } finally {
    await closeBrowser();
  }
}

// ─── User Video（用户视频列表） ──────────────────────────────────

const userVideoHandler: RouteHandler = async ({ params, cookies, abortSignal, maxItems }) => {
  const uid = String(params.uid ?? "");

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  abortSignal.addEventListener("abort", onAbort, { once: true });

  try {
    let vlist: BiliVideo[] = [];

    try {
      const json = await biliFetch<{ list?: { vlist?: BiliVideo[] } }>(
        "/x/space/wbi/arc/search",
        { mid: uid, ps: String(Math.min(maxItems, 50)), pn: "1" },
        cookies,
        controller.signal,
      );
      vlist = json?.list?.vlist ?? [];
    } catch (err) {
      if (err instanceof BiliCaptchaError) {
        // 降级到浏览器：导航到空间页，提取视频列表
        const data = await biliBrowserFetch(
          `https://space.bilibili.com/${uid}/video`,
          "window.__INITIAL_STATE__ ? window.__INITIAL_STATE__.videoData?.vlist : []",
          cookies,
        );
        vlist = Array.isArray(data) ? data : [];
      } else {
        throw err;
      }
    }

    const items = vlist.slice(0, maxItems).map((v: BiliVideo) => ({
      title: v.title ?? "",
      description: v.description ?? "",
      link: `https://www.bilibili.com/video/${v.bvid}`,
      guid: buildGuid("bili", v.bvid ?? String(v.aid)),
      pubDate: v.created ? fromUnixTimestamp(v.created) : new Date().toUTCString(),
      author: v.author,
      image: v.pic,
    }));

    return {
      rssXml: buildRssXml({
        title: `${items[0]?.author ?? uid} - B站视频`,
        link: `https://space.bilibili.com/${uid}/video`,
        description: `B站用户 ${uid} 的视频`,
        language: "zh-CN",
        items,
      }),
      metadata: { itemCount: items.length, platform: "bilibili" },
    };
  } finally {
    abortSignal.removeEventListener("abort", onAbort);
  }
};

// ─── User Favorites（用户收藏视频） ─────────────────────────────

const userFavHandler: RouteHandler = async ({ params, cookies, abortSignal, maxItems }) => {
  const uid = String(params.uid ?? "");
  const fid = String(params.fid ?? "");

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  abortSignal.addEventListener("abort", onAbort, { once: true });

  try {
    // 有 fid 直接拉收藏夹内容；无 fid 时用 uid 取收藏夹列表第一个
    let targetFid = fid;
    let folderTitle: string | undefined;
    if (!targetFid && uid) {
      const folders = await biliFetch<{ list?: BiliFavFolder[] }>(
        "/x/v3/fav/folder/created/list-all",
        { up_mid: uid },
        cookies,
        controller.signal,
      );
      const folderList = folders?.list ?? [];
      targetFid = String(folderList[0]?.id ?? "");
      folderTitle = folderList.find((f) => String(f.id) === targetFid)?.title;
    }

    if (!targetFid) {
      return {
        rssXml: buildRssXml({
          title: `B站收藏 - ${uid || "未知"}`,
          link: uid ? `https://space.bilibili.com/${uid}/favlist` : "https://space.bilibili.com",
          description: "未提供收藏夹 ID 且无法获取用户收藏夹",
          language: "zh-CN",
          items: [],
        }),
        metadata: { itemCount: 0, platform: "bilibili" },
      };
    }

    // 收藏夹内视频
    const json = await biliFetch<{
      info?: { title?: string; upper?: { name?: string } };
      medias?: BiliFavMedia[];
    }>(
      "/x/v3/fav/resource/list",
      { media_id: targetFid, ps: String(Math.min(maxItems, 50)) },
      cookies,
      controller.signal,
    );
    const medias = json?.medias ?? [];
    const upperName = json?.info?.upper?.name;
    const favTitle = folderTitle ?? json?.info?.title ?? "收藏夹";

    const items = medias.slice(0, maxItems).map((m) => ({
      title: m.title ?? "",
      description: m.intro ?? "",
      link: m.bvid
        ? `https://www.bilibili.com/video/${m.bvid}`
        : `https://www.bilibili.com/video/av${m.id}`,
      guid: buildGuid("bili", `fav_${m.id}`),
      pubDate: m.fav_time ? fromUnixTimestamp(m.fav_time) : new Date().toUTCString(),
      author: m.upper?.name ?? upperName,
      image: m.cover,
    }));

    return {
      rssXml: buildRssXml({
        title: `${upperName ?? (uid || "B站")} - 收藏 ${favTitle}`,
        link: uid
          ? `https://space.bilibili.com/${uid}/favlist`
          : `https://www.bilibili.com/medialist/detail/ml${targetFid}`,
        description: `收藏夹 ${favTitle}`,
        language: "zh-CN",
        items,
      }),
      metadata: { itemCount: items.length, platform: "bilibili" },
    };
  } finally {
    abortSignal.removeEventListener("abort", onAbort);
  }
};

// ─── Video Detail（单个视频详情） ────────────────────────────────

const videoHandler: RouteHandler = async ({ params, cookies, abortSignal }) => {
  const bvid = String(params.bvid ?? "");

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  abortSignal.addEventListener("abort", onAbort, { once: true });

  try {
    let videoData: BiliVideoDetail | null = null;

    try {
      const json = await biliFetch<BiliVideoDetail>(
        "/x/web-interface/view",
        { bvid },
        cookies,
        controller.signal,
      );
      videoData = json;
    } catch (err) {
      if (err instanceof BiliCaptchaError) {
        videoData = (await biliBrowserFetch(
          `https://www.bilibili.com/video/${bvid}`,
          "window.__INITIAL_STATE__ ? window.__INITIAL_STATE__.videoData : null",
          cookies,
        )) as BiliVideoDetail | null;
      } else {
        throw err;
      }
    }

    if (!videoData) throw new Error("视频不存在");

    return {
      rssXml: buildRssXml({
        title: videoData.title ?? "B站视频",
        link: `https://www.bilibili.com/video/${videoData.bvid}`,
        description: videoData.desc ?? "",
        language: "zh-CN",
        items: [
          {
            title: videoData.title ?? "",
            description: videoData.desc ?? "",
            link: `https://www.bilibili.com/video/${videoData.bvid ?? bvid}`,
            guid: buildGuid("bili", videoData.bvid ?? bvid),
            pubDate: videoData.pubdate
              ? fromUnixTimestamp(videoData.pubdate)
              : new Date().toUTCString(),
            author: videoData.owner?.name,
            image: videoData.pic,
          },
        ],
      }),
      metadata: { itemCount: 1, platform: "bilibili" },
    };
  } finally {
    abortSignal.removeEventListener("abort", onAbort);
  }
};

// ─── Search（搜索视频） ──────────────────────────────────────────

const searchHandler: RouteHandler = async ({ params, cookies, abortSignal, maxItems }) => {
  const keyword = String(params.keyword ?? "");

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  abortSignal.addEventListener("abort", onAbort, { once: true });

  try {
    let results: BiliSearchResult[] = [];

    try {
      const json = await biliFetch<{ result?: BiliSearchResult[] }>(
        "/x/web-interface/search/type",
        { search_type: "video", keyword, page: "1", page_size: String(Math.min(maxItems, 50)) },
        cookies,
        controller.signal,
      );
      results = json?.result ?? [];
    } catch (err) {
      if (err instanceof BiliCaptchaError) {
        // 降级到浏览器：搜索页面 HTML 解析
        const html = await biliBrowserFetch(
          `https://search.bilibili.com/video?keyword=${encodeURIComponent(keyword)}`,
          "document.documentElement.outerHTML",
          cookies,
        );
        const $ = load(html as string);
        results = [];
        $(".video-list .video-item").each((_i, el) => {
          const titleEl = $(el).find(".title");
          const link = titleEl.attr("href") ?? "";
          const bvidMatch = link.match(/video\/(BV\w+)/);
          if (bvidMatch) {
            results.push({
              bvid: bvidMatch[1],
              title: titleEl.text().trim(),
              author: $(el).find(".up-name").text().trim(),
            });
          }
        });
      } else {
        throw err;
      }
    }

    const items = results
      .filter((r) => r.bvid)
      .slice(0, maxItems)
      .map((r) => ({
        title: (r.title ?? "").replace(/<[^>]+>/g, ""),
        description: r.description ?? "",
        link: `https://www.bilibili.com/video/${r.bvid}`,
        guid: buildGuid("bili", r.bvid!),
        pubDate: r.pubdate ? fromUnixTimestamp(r.pubdate) : new Date().toUTCString(),
        author: r.author,
        category: r.tag ? [r.tag] : undefined,
        image: r.pic,
      }));

    return {
      rssXml: buildRssXml({
        title: `${keyword} - B站搜索`,
        link: `https://search.bilibili.com/video?keyword=${encodeURIComponent(keyword)}`,
        description: `B站搜索 - ${keyword}`,
        language: "zh-CN",
        items,
      }),
      metadata: { itemCount: items.length, platform: "bilibili" },
    };
  } finally {
    abortSignal.removeEventListener("abort", onAbort);
  }
};

// ─── Favorites List（当前登录用户收藏夹列表） ────────────────────

const favsHandler: RouteHandler = async ({ cookies, abortSignal }) => {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  abortSignal.addEventListener("abort", onAbort, { once: true });

  try {
    const uid = extractCookieValue(cookies, "DedeUserID");
    if (!uid) {
      return {
        rssXml: buildRssXml({
          title: "B站收藏夹",
          link: "https://space.bilibili.com",
          description: "未获取到登录用户，请确认已配置 B站 Cookie",
          language: "zh-CN",
          items: [],
        }),
        metadata: { itemCount: 0, platform: "bilibili" },
      };
    }

    const folders = await biliFetch<{ list?: BiliFavFolder[] }>(
      "/x/v3/fav/folder/created/list-all",
      { up_mid: uid },
      cookies,
      controller.signal,
    );
    const folderList = folders?.list ?? [];

    const items = folderList.map((f) => ({
      title: f.title ?? "未命名收藏夹",
      description: String(f.id ?? ""),
      link: `https://space.bilibili.com/${uid}/favlist?fid=${f.id}`,
      guid: buildGuid("bili", `favfolder_${f.id}`),
      pubDate: new Date().toUTCString(),
    }));

    return {
      rssXml: buildRssXml({
        title: "B站收藏夹列表",
        link: `https://space.bilibili.com/${uid}/favlist`,
        description: "当前登录用户的收藏夹",
        language: "zh-CN",
        items,
      }),
      metadata: { itemCount: items.length, platform: "bilibili" },
    };
  } finally {
    abortSignal.removeEventListener("abort", onAbort);
  }
};

// ─── 注册路由 ────────────────────────────────────────────────────

registerRoute("bili/user/video", userVideoHandler);
registerRoute("bili/user/fav", userFavHandler);
registerRoute("bili/favs", favsHandler);
registerRoute("bili/video", videoHandler);
registerRoute("bili/search", searchHandler);
