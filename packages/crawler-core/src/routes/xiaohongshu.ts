/**
 * 小红书路由 handlers
 *
 * - 有 cookie 时：HTTP fetch HTML → cheerio → 提取 __INITIAL_STATE__
 * - 无 cookie 时：AgentBrowser → page.evaluate() 提取数据
 * - 视频笔记：提取多码流 URL（av1/h264/h265/h266）
 * - 收藏 tab：waitForResponse 拦截 API
 * - 搜索：X-S/X-T 签名
 */
import crypto from "node:crypto";
import { load } from "cheerio";
import type { RouteHandler } from "../core/types.js";
import { registerRoute } from "../core/route-registry.js";
import { buildRssXml, buildGuid, fromUnixTimestamp } from "../core/rss-builder.js";
import { createBrowser, closeBrowser, injectCookies } from "../core/browser.js";

const XHS_SALT = "i+X,MqLqFLwG";

/** 小红书笔记数据结构（仅包含实际使用的字段） */
interface XhsNote {
  note_id?: string;
  id?: string;
  note_card?: XhsNote;
  type?: string;
  title?: string;
  display_title?: string;
  desc?: string;
  time?: number;
  user?: { nickname?: string; nickName?: string };
  tag_list?: XhsTag[];
  tagList?: XhsTag[];
  imageList?: XhsImage[];
  cover?: { urlDefault?: string };
  video?: {
    consumer?: { originVideoKey?: string };
    media?: { stream?: Record<string, XhsStream[]> };
  };
}

/** 小红书标签 */
interface XhsTag {
  name?: string;
}

/** 小红书图片 */
interface XhsImage {
  urlDefault?: string;
  url?: string;
  livePhoto?: boolean;
  stream?: Record<string, XhsStream[]>;
}

/** 小红书视频流 */
interface XhsStream {
  masterUrl?: string;
  backupUrls?: string[];
}

/** 小红书搜索 API 响应 */
interface XhsSearchResponse {
  data?: { items?: XhsNote[] };
}

/** 小红书 __INITIAL_STATE__ 中用户数据结构 */
interface XhsInitialState {
  user?: {
    notes?: unknown;
    collect?: unknown;
  };
  note?: {
    noteDetailMap?: Record<string, { note?: XhsNote }>;
    firstNoteId?: string;
  };
}
const BASE_URL = "https://edith.xiaohongshu.com";

function generateSignature(path: string, body: string, xt: string): string {
  const signStr = `${path}&${body}&${xt}&${XHS_SALT}`;
  const md5 = crypto.createHash("md5").update(signStr, "utf-8").digest("hex");
  return `x_x_${md5}`;
}

function buildXhsHeaders(path: string, body: string, cookies?: string): Record<string, string> {
  const xt = Date.now().toString();
  const xs = generateSignature(path, body, xt);
  return {
    "Content-Type": "application/json;charset=UTF-8",
    Origin: "https://www.xiaohongshu.com",
    Referer: "https://www.xiaohongshu.com/explore",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "X-S": xs,
    "X-T": xt,
    ...(cookies ? { Cookie: cookies } : {}),
  };
}

// ─── 辅助函数 ────────────────────────────────────────────────────

function extractInitialState(html: string): XhsInitialState | null {
  const $ = load(html);
  const scriptText = $("script")
    .filter((_i, el) => {
      const text = (el as { children?: { data?: string }[] })?.children?.[0]?.data ?? "";
      return text.startsWith("window.__INITIAL_STATE__=");
    })
    .text();

  if (!scriptText) return null;

  const json = scriptText.slice("window.__INITIAL_STATE__=".length).replaceAll("undefined", "null");
  try {
    return JSON.parse(json) as XhsInitialState | null;
  } catch {
    return null;
  }
}

function extractNotesFromState(state: XhsInitialState | null): XhsNote[] {
  const notes = state?.user?.notes ?? [];
  return Array.isArray(notes)
    ? (notes.flat() as XhsNote[])
    : Array.isArray((notes as { _rawValue?: unknown[] })?._rawValue)
      ? (notes as { _rawValue: XhsNote[] })._rawValue
      : [];
}

function formatText(text: string): string {
  return text.replace(/(\r\n|\r|\n)/g, "<br>").replace("\t", "&emsp;");
}

function formatTagList(tagList: XhsTag[] | undefined): string {
  if (!tagList?.length) return "";
  return tagList.map((item) => `#${item.name} `).join("");
}

/**
 * 从笔记详情提取视频流媒体 HTML
 */
function buildMediaHtml(note: XhsNote, displayLivePhoto = false): string {
  let mediaContent = "";

  if (note.type === "video") {
    const originVideoKey = note.video?.consumer?.originVideoKey;
    const videoUrls: string[] = [];

    if (originVideoKey) {
      videoUrls.push(`http://sns-video-al.xhscdn.com/${originVideoKey}`);
    }

    const streamTypes = ["av1", "h264", "h265", "h266"] as const;
    for (const type of streamTypes) {
      const streams = note.video?.media?.stream?.[type];
      if (streams && streams.length > 0) {
        const stream = streams[0];
        if (stream.masterUrl) {
          videoUrls.push(stream.masterUrl);
        }
        if (stream.backupUrls?.length) {
          videoUrls.push(...stream.backupUrls);
        }
      }
    }

    const posterUrl = note.imageList?.[0]?.urlDefault;

    if (videoUrls.length > 0) {
      mediaContent = `<video controls ${posterUrl ? `poster="${posterUrl}"` : ""}>
          ${videoUrls.map((url) => `<source src="${url}" type="video/mp4">`).join("\n")}
      </video><br>`;
    }
  } else if (note.imageList?.length) {
    mediaContent = note.imageList
      .map((image: XhsImage) => {
        if (image.livePhoto && displayLivePhoto) {
          const videoUrls: string[] = [];
          const streamTypes = ["av1", "h264", "h265", "h266"] as const;
          for (const type of streamTypes) {
            const streams = image.stream?.[type];
            if (streams && streams.length > 0) {
              if (streams[0].masterUrl) videoUrls.push(streams[0].masterUrl);
              if (streams[0].backupUrls?.length) videoUrls.push(...streams[0].backupUrls);
            }
          }
          if (videoUrls.length > 0) {
            return `<video controls poster="${image.urlDefault}">${videoUrls.map((u) => `<source src="${u}" type="video/mp4">`).join("\n")}</video>`;
          }
        }
        return `<img src="${image.urlDefault ?? image.url}"><br>`;
      })
      .join("");
  }

  return mediaContent;
}

/**
 * 获取笔记完整内容（含视频流 URL）
 */
function enrichNoteDescription(note: XhsNote): string {
  if (!note) return "";
  const mediaHtml = buildMediaHtml(note);
  const tagHtml = formatTagList(note.tag_list ?? note.tagList);
  const descHtml = formatText(note.desc ?? "");
  return [mediaHtml, tagHtml, descHtml].filter(Boolean).join("<br><br>");
}

/** 小红书 RSS 条目 */
interface XhsRssItem {
  title: string;
  description: string;
  link: string;
  guid: string;
  pubDate: string;
  author?: string;
  category?: string[];
  image?: string;
}

function noteToRssItem(note: XhsNote, tag?: string): XhsRssItem | null {
  const noteCard = note.note_card ?? note;
  if (!noteCard?.note_id && !noteCard?.id) return null;

  const id = noteCard.note_id ?? noteCard.id ?? "";
  const firstImage = noteCard.imageList?.[0]?.urlDefault ?? noteCard.cover?.urlDefault;

  return {
    title:
      (noteCard.display_title ?? noteCard.title ?? (noteCard.desc ?? "").substring(0, 80)) || "",
    description: enrichNoteDescription(noteCard),
    link: `https://www.xiaohongshu.com/explore/${id}`,
    guid: buildGuid("xhs", id),
    pubDate: noteCard.time ? fromUnixTimestamp(noteCard.time) : new Date().toUTCString(),
    author: noteCard.user?.nickname ?? noteCard.user?.nickName,
    category: tag ? [tag] : undefined,
    image: firstImage,
  };
}

// ─── User Notes（用户笔记列表） ──────────────────────────────────

const userNotesHandler: RouteHandler = async ({ params, cookies, abortSignal, maxItems }) => {
  const userId = String(params.user_id ?? "");

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  abortSignal.addEventListener("abort", onAbort, { once: true });

  try {
    let items: XhsRssItem[] = [];

    if (cookies) {
      const url = `https://www.xiaohongshu.com/user/profile/${userId}`;
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
          Cookie: cookies,
        },
        signal: controller.signal,
      });
      const html = await res.text();
      const state = extractInitialState(html);
      const notes = extractNotesFromState(state);
      items = notes
        .slice(0, maxItems)
        .map((n) => noteToRssItem(n))
        .filter((item): item is XhsRssItem => item !== null);
    } else {
      const browser = await createBrowser();
      try {
        await browser.ensureReady();
        const manager = await browser.getManagerForThread();
        const page = manager.getPage();
        await page.route("**/*", (route) => {
          const type = route.request().resourceType();
          if (["image", "media", "font", "stylesheet"].includes(type)) {
            void route.abort();
          } else {
            void route.continue();
          }
        });
        await injectCookies(page, cookies, ".xiaohongshu.com");
        await page.goto(`https://www.xiaohongshu.com/user/profile/${userId}`, {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
        const initialState = (await page.evaluate(
          "window.__INITIAL_STATE__ || null",
        )) as XhsInitialState | null;
        if (initialState) {
          const notes = extractNotesFromState(initialState);
          items = notes
            .slice(0, maxItems)
            .map((n) => noteToRssItem(n))
            .filter((item): item is XhsRssItem => item !== null);
        }
      } finally {
        await closeBrowser();
      }
    }

    return {
      rssXml: buildRssXml({
        title: `小红书用户 ${userId} 的笔记`,
        link: `https://www.xiaohongshu.com/user/profile/${userId}`,
        description: `小红书用户 ${userId} 的最新笔记`,
        language: "zh-CN",
        items,
      }),
      metadata: { itemCount: items.length, platform: "xiaohongshu" },
    };
  } finally {
    abortSignal.removeEventListener("abort", onAbort);
  }
};

// ─── User Collect（用户收藏） ────────────────────────────────────

const userCollectHandler: RouteHandler = async ({ params, cookies, abortSignal, maxItems }) => {
  const userId = String(params.user_id ?? "");

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  abortSignal.addEventListener("abort", onAbort, { once: true });

  try {
    let items: XhsRssItem[] = [];

    if (cookies) {
      const url = `https://www.xiaohongshu.com/user/profile/${userId}`;
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
          Cookie: cookies,
        },
        signal: controller.signal,
      });
      const html = await res.text();
      const state = extractInitialState(html);
      const collect = state?.user?.collect ?? [];
      const collectList = Array.isArray(collect) ? (collect as XhsNote[]) : [];
      items = collectList
        .slice(0, maxItems)
        .map((n) => noteToRssItem(n))
        .filter((item): item is XhsRssItem => item !== null);
    } else {
      const browser = await createBrowser();
      try {
        await browser.ensureReady();
        const manager = await browser.getManagerForThread();
        const page = manager.getPage();
        await page.route("**/*", (route) => {
          const type = route.request().resourceType();
          if (["image", "media", "font", "stylesheet"].includes(type)) {
            void route.abort();
          } else {
            void route.continue();
          }
        });
        await injectCookies(page, cookies, ".xiaohongshu.com");
        await page.goto(`https://www.xiaohongshu.com/user/profile/${userId}`, {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });

        // 点击收藏 tab，等待 XHR 响应
        const tabSelector = "div.reds-tab-item:nth-child(2)";
        const hasTab = await page.$(tabSelector);
        if (hasTab) {
          const responsePromise = page.waitForResponse(
            (res) => {
              const req = res.request();
              return (
                req.url().includes("/api/sns/web/v2/note/collect/page") && req.method() === "GET"
              );
            },
            { timeout: 5_000 },
          );
          await page.click(tabSelector);
          await responsePromise; // 等待接口返回
        }

        const initialState = (await page.evaluate(
          "window.__INITIAL_STATE__ || null",
        )) as XhsInitialState | null;
        if (initialState) {
          const collect = initialState?.user?.collect ?? [];
          const collectList = Array.isArray(collect) ? (collect as XhsNote[]) : [];
          items = collectList
            .slice(0, maxItems)
            .map((n) => noteToRssItem(n))
            .filter((item): item is XhsRssItem => item !== null);
        }
      } finally {
        await closeBrowser();
      }
    }

    return {
      rssXml: buildRssXml({
        title: `小红书用户 ${userId} 的收藏`,
        link: `https://www.xiaohongshu.com/user/profile/${userId}`,
        description: `小红书用户 ${userId} 的收藏`,
        language: "zh-CN",
        items,
      }),
      metadata: { itemCount: items.length, platform: "xiaohongshu" },
    };
  } finally {
    abortSignal.removeEventListener("abort", onAbort);
  }
};

// ─── Note Detail（笔记详情，含视频流） ───────────────────────────

const noteHandler: RouteHandler = async ({ params, cookies, abortSignal }) => {
  const noteId = String(params.note_id ?? "");

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  abortSignal.addEventListener("abort", onAbort, { once: true });

  try {
    let noteData: XhsNote | null = null;

    if (cookies) {
      const url = `https://www.xiaohongshu.com/explore/${noteId}`;
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
          Cookie: cookies,
        },
        signal: controller.signal,
      });
      const html = await res.text();
      const state = extractInitialState(html);
      const detailMap = state?.note?.noteDetailMap ?? {};
      const firstNoteId = state?.note?.firstNoteId;
      noteData = firstNoteId ? (detailMap[firstNoteId]?.note ?? null) : null;
    } else {
      const browser = await createBrowser();
      try {
        await browser.ensureReady();
        const manager = await browser.getManagerForThread();
        const page = manager.getPage();
        await page.route("**/*", (route) => {
          const type = route.request().resourceType();
          if (["image", "media", "font", "stylesheet"].includes(type)) {
            void route.abort();
          } else {
            void route.continue();
          }
        });
        await injectCookies(page, cookies, ".xiaohongshu.com");
        await page.goto(`https://www.xiaohongshu.com/explore/${noteId}`, {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
        const initialState = (await page.evaluate(
          "window.__INITIAL_STATE__ || null",
        )) as XhsInitialState | null;
        if (initialState) {
          const detailMap = initialState?.note?.noteDetailMap ?? {};
          const firstNoteId = initialState?.note?.firstNoteId;
          noteData = firstNoteId ? (detailMap[firstNoteId]?.note ?? null) : null;
        }
      } finally {
        await closeBrowser();
      }
    }

    // 使用 getFullNote 风格构建含视频流的描述
    const rssItem = noteData
      ? {
          title:
            (noteData.display_title ?? noteData.title ?? (noteData.desc ?? "").substring(0, 80)) ||
            "",
          description: enrichNoteDescription(noteData),
          link: `https://www.xiaohongshu.com/explore/${noteId}`,
          guid: buildGuid("xhs", noteId),
          pubDate: noteData.time ? fromUnixTimestamp(noteData.time) : new Date().toUTCString(),
          author: noteData.user?.nickname,
        }
      : null;

    const items = rssItem ? [rssItem] : [];

    return {
      rssXml: buildRssXml({
        title: items[0]?.title || "小红书笔记",
        link: `https://www.xiaohongshu.com/explore/${noteId}`,
        description: "小红书笔记详情",
        language: "zh-CN",
        items,
      }),
      metadata: { itemCount: items.length, platform: "xiaohongshu" },
    };
  } finally {
    abortSignal.removeEventListener("abort", onAbort);
  }
};

// ─── Search（搜索笔记） ──────────────────────────────────────────

const searchHandler: RouteHandler = async ({ params, cookies, abortSignal, maxItems }) => {
  const keyword = String(params.keyword ?? "");

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  abortSignal.addEventListener("abort", onAbort, { once: true });

  try {
    const path = "/api/sns/web/v1/search/notes";
    const body = JSON.stringify({
      keyword,
      page: 1,
      page_size: Math.min(maxItems, 20),
      sort: "general",
      note_type: 0,
    });

    const headers = buildXhsHeaders(path, body, cookies);
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`XHS API ${res.status}: ${res.statusText}`);
    }

    const json = (await res.json()) as XhsSearchResponse;
    const notes = json?.data?.items ?? [];
    const items = notes
      .filter((n) => n.note_card)
      .slice(0, maxItems)
      .map((n) => noteToRssItem(n.note_card!, keyword))
      .filter((item): item is XhsRssItem => item !== null);

    return {
      rssXml: buildRssXml({
        title: `${keyword} - 小红书搜索`,
        link: `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}`,
        description: `小红书搜索 - ${keyword}`,
        language: "zh-CN",
        items,
      }),
      metadata: { itemCount: items.length, platform: "xiaohongshu" },
    };
  } finally {
    abortSignal.removeEventListener("abort", onAbort);
  }
};

// ─── 注册路由 ────────────────────────────────────────────────────

registerRoute("xhs/user/notes", userNotesHandler);
registerRoute("xhs/user/collect", userCollectHandler);
registerRoute("xhs/note", noteHandler);
registerRoute("xhs/search", searchHandler);
