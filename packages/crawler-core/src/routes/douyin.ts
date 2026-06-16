/**
 * 抖音路由 handlers
 *
 * - AgentBrowser + 响应拦截
 * - 拦截 /web/aweme/post、/web/aweme/detail/、/web/general/search/single/
 */
import type { RouteHandler } from "../core/types.js";
import { registerRoute } from "../core/route-registry.js";
import { buildRssXml, buildGuid, fromUnixTimestamp } from "../core/rss-builder.js";
import { createBrowser, closeBrowser } from "../core/browser.js";

async function waitForResponse(page: any, urlPattern: string, timeout = 60_000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`等待 ${urlPattern} 超时`)), timeout);
    page.on("response", async (response: any) => {
      try {
        if (response.ok() && response.url().includes(urlPattern)) {
          clearTimeout(timer);
          resolve(await response.json());
        }
      } catch {
        // ignore parse errors on non-JSON responses
      }
    });
  });
}

// ─── User（用户作品列表） ────────────────────────────────────────

const userHandler: RouteHandler = async ({ params, abortSignal, maxItems }) => {
  const uid = String(params.uid ?? "");

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  abortSignal.addEventListener("abort", onAbort, { once: true });

  try {
    const browser = await createBrowser();
    try {
      await browser.ensureReady();
      const manager = await browser.getManagerForThread();
      const page = manager.getPage();

      // 屏蔽非关键资源
      await page.route("**/*", (route) => {
        const type = route.request().resourceType();
        if (["image", "media", "font", "stylesheet"].includes(type)) {
          route.abort();
        } else {
          route.continue();
        }
      });

      // 并发等待拦截响应和导航完成
      const [postData] = await Promise.all([
        waitForResponse(page, "/web/aweme/post"),
        page.goto(`https://www.douyin.com/user/${uid}`, {
          waitUntil: "networkidle",
          timeout: 60_000,
        }),
      ]);

      const awemeList = postData?.aweme_list ?? [];
      const author = awemeList[0]?.author;

      const items = awemeList.slice(0, maxItems).map((post: any) => ({
        title: (post.desc || "").split("\n", 1)[0] || "",
        description: post.desc || "",
        link: `https://www.douyin.com/video/${post.aweme_id}`,
        guid: buildGuid("douyin", post.aweme_id),
        pubDate: post.create_time ? fromUnixTimestamp(post.create_time) : new Date().toUTCString(),
        author: author?.nickname,
        category: post.video_tag?.map((t: any) => t.tag_name) || undefined,
      }));

      return {
        rssXml: buildRssXml({
          title: `${author?.nickname || uid} - 抖音`,
          link: `https://www.douyin.com/user/${uid}`,
          description: `抖音用户 ${author?.nickname || uid} 的作品`,
          language: "zh-CN",
          items,
        }),
        metadata: { itemCount: items.length, platform: "douyin" },
      };
    } finally {
      await closeBrowser();
    }
  } finally {
    abortSignal.removeEventListener("abort", onAbort);
  }
};

// ─── Detail（单个视频详情） ──────────────────────────────────────

const detailHandler: RouteHandler = async ({ params, abortSignal }) => {
  const awemeId = String(params.aweme_id ?? "");

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  abortSignal.addEventListener("abort", onAbort, { once: true });

  try {
    const browser = await createBrowser();
    try {
      await browser.ensureReady();
      const manager = await browser.getManagerForThread();
      const page = manager.getPage();

      await page.route("**/*", (route) => {
        const type = route.request().resourceType();
        if (["image", "media", "font", "stylesheet"].includes(type)) {
          route.abort();
        } else {
          route.continue();
        }
      });

      const [detailData] = await Promise.all([
        waitForResponse(page, "/web/aweme/detail/"),
        page.goto(`https://www.douyin.com/video/${awemeId}`, {
          waitUntil: "networkidle",
          timeout: 60_000,
        }),
      ]);

      const awemeDetail = detailData?.aweme_detail;

      return {
        rssXml: buildRssXml({
          title: (awemeDetail?.desc || "").split("\n", 1)[0] || "抖音视频",
          link: `https://www.douyin.com/video/${awemeId}`,
          description: awemeDetail?.desc || "",
          language: "zh-CN",
          items: awemeDetail
            ? [
                {
                  title: (awemeDetail.desc || "").split("\n", 1)[0] || "",
                  description: awemeDetail.desc || "",
                  link: `https://www.douyin.com/video/${awemeDetail.aweme_id}`,
                  guid: buildGuid("douyin", awemeDetail.aweme_id),
                  pubDate: awemeDetail.create_time
                    ? fromUnixTimestamp(awemeDetail.create_time)
                    : new Date().toUTCString(),
                  author: awemeDetail.author?.nickname,
                },
              ]
            : [],
        }),
        metadata: { itemCount: awemeDetail ? 1 : 0, platform: "douyin" },
      };
    } finally {
      await closeBrowser();
    }
  } finally {
    abortSignal.removeEventListener("abort", onAbort);
  }
};

// ─── Search（搜索视频） ──────────────────────────────────────────

const searchHandler: RouteHandler = async ({ params, abortSignal, maxItems }) => {
  const keyword = String(params.keyword ?? "");

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  abortSignal.addEventListener("abort", onAbort, { once: true });

  try {
    const browser = await createBrowser();
    try {
      await browser.ensureReady();
      const manager = await browser.getManagerForThread();
      const page = manager.getPage();

      await page.route("**/*", (route) => {
        const type = route.request().resourceType();
        if (["image", "media", "font", "stylesheet"].includes(type)) {
          route.abort();
        } else {
          route.continue();
        }
      });

      const [searchData] = await Promise.all([
        waitForResponse(page, "/web/general/search/single/"),
        page.goto(`https://www.douyin.com/search/${encodeURIComponent(keyword)}?type=general`, {
          waitUntil: "networkidle",
          timeout: 60_000,
        }),
      ]);

      const awemeList = searchData?.aweme_list ?? [];

      const items = awemeList.slice(0, maxItems).map((post: any) => ({
        title: (post.desc || "").split("\n", 1)[0] || "",
        description: post.desc || "",
        link: `https://www.douyin.com/video/${post.aweme_id}`,
        guid: buildGuid("douyin", `search_${post.aweme_id}`),
        pubDate: post.create_time ? fromUnixTimestamp(post.create_time) : new Date().toUTCString(),
        author: post.author?.nickname,
      }));

      return {
        rssXml: buildRssXml({
          title: `${keyword} - 抖音搜索`,
          link: `https://www.douyin.com/search/${encodeURIComponent(keyword)}`,
          description: `抖音搜索 - ${keyword}`,
          language: "zh-CN",
          items,
        }),
        metadata: { itemCount: items.length, platform: "douyin" },
      };
    } finally {
      await closeBrowser();
    }
  } finally {
    abortSignal.removeEventListener("abort", onAbort);
  }
};

// ─── 注册路由 ────────────────────────────────────────────────────

registerRoute("dy/user", userHandler);
registerRoute("dy/detail", detailHandler);
registerRoute("dy/search", searchHandler);
