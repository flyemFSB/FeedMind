/**
 * 百度贴吧路由 handlers
 *
 * 数据获取方式：HTTP GET + cheerio HTML 解析
 * - forum: GET tieba.baidu.com/f?kw={kw} → 从 HTML 注释节点提取帖子列表
 * - post: GET tieba.baidu.com/p/{id}?ajax=1 → 解析帖子回复
 * - search: 关键词搜索
 */
import { load } from "cheerio";
import type { RouteHandler } from "../core/types.js";
import { registerRoute } from "../core/route-registry.js";
import { buildRssXml, buildGuid } from "../core/rss-builder.js";

// ─── Forum（吧内帖子列表） ─────────────────────────────────────

const forumHandler: RouteHandler = async ({ params, abortSignal, maxItems }) => {
  const kw = String(params.kw ?? "");
  if (!kw) {
    return {
      rssXml: buildRssXml({
        title: "贴吧",
        link: "https://tieba.baidu.com",
        description: "百度贴吧",
        language: "zh-CN",
        items: [],
      }),
      metadata: { itemCount: 0, platform: "tieba" },
    };
  }

  const url = `https://tieba.baidu.com/f?kw=${encodeURIComponent(kw)}&ie=utf-8`;

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  abortSignal.addEventListener("abort", onAbort, { once: true });

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        Referer: "https://tieba.baidu.com/",
      },
    });
    const html = await res.text();
    const $ = load(html);

    const threadListHTML = $('code[id="pagelet_html_frs-list/pagelet/thread_list"]')
      .contents()
      .filter((_i: number, el: any) => el.nodeType === 8);

    const commentData = (threadListHTML as any).prevObject?.[0]?.data;
    if (!commentData) {
      return {
        rssXml: buildRssXml({
          title: `${kw}吧`,
          link: url,
          description: `百度贴吧 - ${kw}吧`,
          language: "zh-CN",
          items: [],
        }),
        metadata: { itemCount: 0, platform: "tieba" },
      };
    }

    const thread$ = load(commentData);
    const list = thread$("#thread_list > .j_thread_list[data-field]")
      .toArray()
      .slice(0, maxItems)
      .map((element) => {
        const item = thread$(element);
        const field = item.data("field") as any;
        if (!field?.id) return null;

        const id = field.id;
        const authorName = field.author_name;
        const title = item.find("a.j_th_tit").text().trim();
        const details = item.find(".threadlist_abs").text().trim();
        const medias = item
          .find(".threadlist_media img")
          .toArray()
          .map((el) => `<img src="${thread$(el).attr("bpic")}">`)
          .join("");

        const timeText =
          item.find(".is_show_create_time").text().trim() ||
          item.find(".threadlist_reply_date").text().trim();

        return {
          title,
          description: `${details ? `<p>${details}</p>` : ""}${medias ? `<p>${medias}</p>` : ""}<p>作者：${authorName}</p>`,
          link: `https://tieba.baidu.com/p/${id}`,
          guid: buildGuid("tieba", String(id)),
          pubDate: parseTiebaTime(timeText),
          author: authorName,
        };
      })
      .filter(Boolean);

    return {
      rssXml: buildRssXml({
        title: `${kw}吧`,
        link: url,
        description: `百度贴吧 - ${kw}吧`,
        language: "zh-CN",
        items: list as any[],
      }),
      metadata: { itemCount: list.length, platform: "tieba" },
    };
  } finally {
    abortSignal.removeEventListener("abort", onAbort);
  }
};

// ─── Post（帖子详情） ──────────────────────────────────────────

const postHandler: RouteHandler = async ({ params, abortSignal, maxItems }) => {
  const id = String(params.id ?? "");

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  abortSignal.addEventListener("abort", onAbort, { once: true });

  try {
    // ajax=1 获取纯数据
    const res = await fetch(`https://tieba.baidu.com/p/${id}?see_lz=0&pn=1&ajax=1`, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        Referer: "https://tieba.baidu.com/",
      },
    });
    const html = await res.text();
    const $ = load(html);
    const title = $(".core_title_txt").attr("title") || `帖子${id}`;

    const items = $(".p_postlist > [data-field]:not(:has(.ad_bottom_view))")
      .toArray()
      .slice(0, maxItems)
      .map((element) => {
        const item = $(element);
        const field = item.data("field") as any;
        const authorName = field?.author?.user_name || "";
        const content = field?.content?.content || item.find(".j_d_post_content").html() || "";
        const pubContent = typeof content === "string" ? content : "";

        const tempList = item
          .find(".post-tail-wrap > .tail-info")
          .toArray()
          .map((el) => $(el).text());

        let pubDate = "";
        if (tempList.length >= 2) {
          pubDate = tempList[tempList.length - 2];
        }

        return {
          title: `${authorName}回复了帖子《${title}》`,
          description: `<p>${pubContent}</p><br>作者：${authorName}<br>`,
          link: `https://tieba.baidu.com/p/${id}`,
          guid: buildGuid("tieba", `${id}_${field?.content?.post_id || ""}`),
          pubDate: pubDate || new Date().toUTCString(),
          author: authorName,
        };
      });

    return {
      rssXml: buildRssXml({
        title,
        link: `https://tieba.baidu.com/p/${id}`,
        description: `${title}的最新回复`,
        language: "zh-CN",
        items,
      }),
      metadata: { itemCount: items.length, platform: "tieba" },
    };
  } finally {
    abortSignal.removeEventListener("abort", onAbort);
  }
};

// ─── Search（搜索帖子） ────────────────────────────────────────

const searchHandler: RouteHandler = async ({ params, abortSignal, maxItems }) => {
  const keyword = String(params.keyword ?? "");

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  abortSignal.addEventListener("abort", onAbort, { once: true });

  try {
    const searchUrl = `https://tieba.baidu.com/f/search/res?ie=utf-8&kw=&qw=${encodeURIComponent(keyword)}&rn=${Math.min(maxItems, 50)}`;
    const res = await fetch(searchUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      },
    });
    const html = await res.text();
    const $ = load(html);

    const items = $(".s_post_list .s_post")
      .toArray()
      .slice(0, maxItems)
      .map((el) => {
        const titleEl = $(el).find(".p_title a");
        const title = titleEl.text().trim();
        const href = titleEl.attr("href") || "";
        const link = href.startsWith("http") ? href : `https://tieba.baidu.com${href}`;
        const desc = $(el).find(".p_content").text().trim();
        const author = $(el).find(".p_author").text().trim();

        const threadMatch = href.match(/\/p\/(\d+)/);
        const contentId = threadMatch?.[1] || href;

        return {
          title,
          description: desc,
          link,
          guid: buildGuid("tieba", contentId),
          pubDate: new Date().toUTCString(),
          author: author || undefined,
        };
      });

    return {
      rssXml: buildRssXml({
        title: `${keyword} - 贴吧搜索`,
        link: `https://tieba.baidu.com/f/search/res?ie=utf-8&kw=&qw=${encodeURIComponent(keyword)}`,
        description: `百度贴吧搜索 - ${keyword}`,
        language: "zh-CN",
        items,
      }),
      metadata: { itemCount: items.length, platform: "tieba" },
    };
  } finally {
    abortSignal.removeEventListener("abort", onAbort);
  }
};

// ─── 辅助函数 ────────────────────────────────────────────────────

function parseTiebaTime(text: string): string {
  if (!text) return new Date().toUTCString();
  // 贴吧时间格式: "HH:mm", "M-D", "YYYY-MM"
  // 简单处理：如果是 HH:mm 格式，说明是今天
  if (/^\d{1,2}:\d{2}$/.test(text)) {
    const d = new Date();
    const [h, m] = text.split(":");
    d.setHours(Number(h), Number(m), 0, 0);
    return d.toUTCString();
  }
  // 其他格式尝试解析
  const d = new Date(text);
  if (!Number.isNaN(d.getTime())) return d.toUTCString();
  return new Date().toUTCString();
}

// ─── 注册路由 ────────────────────────────────────────────────────

registerRoute("tieba/forum", forumHandler);
registerRoute("tieba/post", postHandler);
registerRoute("tieba/search", searchHandler);
