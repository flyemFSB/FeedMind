/**
 * 小红书路由 handlers（仅收藏）
 *
 * - 有 cookie 时：HTTP fetch HTML → cheerio → 提取 __INITIAL_STATE__
 * - 无 cookie 时：AgentBrowser → page.evaluate() 提取数据
 * - 收藏 tab：waitForResponse 拦截 API
 */
import { load } from "cheerio";
import type { RouteHandler } from "../core/types.js";
import { registerRoute } from "../core/route-registry.js";
import { buildRssXml, buildGuid, fromUnixTimestamp } from "../core/rss-builder.js";
import {
  createBrowser,
  closeBrowser,
  ensureCookies,
  blockHeavyResources,
} from "../core/browser.js";

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
        if (stream?.masterUrl) {
          videoUrls.push(stream.masterUrl);
        }
        if (stream?.backupUrls?.length) {
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
              const stream = streams[0];
              if (stream?.masterUrl) videoUrls.push(stream.masterUrl);
              if (stream?.backupUrls?.length) videoUrls.push(...stream.backupUrls);
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
  const author = noteCard.user?.nickname ?? noteCard.user?.nickName;

  return {
    title:
      (noteCard.display_title ?? noteCard.title ?? (noteCard.desc ?? "").substring(0, 80)) || "",
    description: enrichNoteDescription(noteCard),
    link: `https://www.xiaohongshu.com/explore/${id}`,
    guid: buildGuid("xhs", id),
    pubDate: noteCard.time ? fromUnixTimestamp(noteCard.time) : new Date().toUTCString(),
    ...(author ? { author } : {}),
    ...(tag ? { category: [tag] } : {}),
    ...(firstImage ? { image: firstImage } : {}),
  };
}

// ─── User Collect（用户收藏） ────────────────────────────────────

const userCollectHandler: RouteHandler = async ({ params, cookies, abortSignal, maxItems }) => {
  const userId = String(params["user_id"] ?? "");

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
      const page = await createBrowser();
      try {
        await blockHeavyResources(page);
        await ensureCookies(page, cookies, "xiaohongshu.com");
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
          await responsePromise;
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

// ─── 注册路由 ────────────────────────────────────────────────────

registerRoute("xhs/user/collect", userCollectHandler);
