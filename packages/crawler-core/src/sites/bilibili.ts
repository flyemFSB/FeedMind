/**
 * B站 路由 handlers（仅收藏夹）
 *
 * - WBI 签名：从 nav API + JS 排列表获取 wbiVerifyString
 * - 反爬探针：dm_img_list, dm_img_str, dm_cover_img_str
 * - Cookie 认证必需
 * - -352 错误时降级到 AgentBrowser 兜底
 */
import type { RouteHandler } from "../core/types.js";
import { registerRoute } from "../core/route-registry.js";
import { buildRssXml, buildGuid, fromUnixTimestamp } from "../core/rss-builder.js";
import {
  getWbiVerifyString,
  addWbiVerifyInfo,
  addDmVerifyInfo,
  getDmImgList,
} from "../core/wbi-sign.js";
import { CrawlerAuthError } from "../core/errors.js";

/** B站 API 通用响应结构 */
interface BiliApiResponse<T = unknown> {
  code: number;
  message?: string;
  data: T;
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
  if (cookies) headers["Cookie"] = cookies;

  const res = await fetch(url, { headers, ...(signal ? { signal } : {}) });
  if (!res.ok) throw new Error(`BILI API ${res.status}`);

  const json = (await res.json()) as BiliApiResponse<T>;
  if (json.code === -352) {
    throw new BiliCaptchaError();
  }
  if (json.code !== 0) {
    // -101 = 未登录 / 登录态失效
    if (json.code === -101) throw new CrawlerAuthError("B站登录态已失效");
    throw new Error(`BILI API error: ${json.code} - ${json.message ?? "unknown"}`);
  }
  return json.data;
}

// ─── User Favorites（用户收藏视频） ─────────────────────────────

const userFavHandler: RouteHandler = async ({ params, cookies, abortSignal, maxItems }) => {
  const uid = String(params["uid"] ?? "");
  const fid = String(params["fid"] ?? "");

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

    const items = medias.slice(0, maxItems).map((m) => {
      const author = m.upper?.name ?? upperName;
      return {
        title: m.title ?? "",
        description: m.intro ?? "",
        link: m.bvid
          ? `https://www.bilibili.com/video/${m.bvid}`
          : `https://www.bilibili.com/video/av${m.id}`,
        guid: buildGuid("bili", `fav_${m.id}`),
        pubDate: m.fav_time ? fromUnixTimestamp(m.fav_time) : new Date().toUTCString(),
        ...(author ? { author } : {}),
        ...(m.cover ? { image: m.cover } : {}),
      };
    });

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

// ─── Favorites List（当前登录用户收藏夹列表） ────────────────────

const favsHandler: RouteHandler = async ({ cookies, abortSignal }) => {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  abortSignal.addEventListener("abort", onAbort, { once: true });

  try {
    const uid = extractCookieValue(cookies, "DedeUserID");
    if (!uid) {
      throw new CrawlerAuthError("B站登录态已失效（未找到登录用户）");
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

registerRoute("bili/user/fav", userFavHandler);
registerRoute("bili/favs", favsHandler);
