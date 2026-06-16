/**
 * 快手路由 handlers
 *
 * - AgentBrowser 响应拦截
 *   - 拦截 /live_api/profile/public 和 /live_api/baseuser/userinfo/byid
 * - 先导航到主页，再导航到用户主页
 */
import type { RouteHandler } from "../core/types.js";
import { registerRoute } from "../core/route-registry.js";
import { buildRssXml, buildGuid, fromUnixTimestamp } from "../core/rss-builder.js";
import { createBrowser, closeBrowser } from "../core/browser.js";

// ─── Profile（用户作品列表） ─────────────────────────────────────

const profileHandler: RouteHandler = async ({ params, abortSignal, maxItems }) => {
  const principalId = String(params.principal_id ?? "");

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
        if (["image", "media", "font", "stylesheet", "ping"].includes(type)) {
          route.abort();
        } else {
          route.continue();
        }
      });

      // 拦截 API 响应
      let profileData: any = null;
      let userInfo: any = null;

      page.on("response", async (response: any) => {
        if (response.ok()) {
          const url = response.url();
          if (url.includes("/live_api/profile/public") && !profileData) {
            try {
              const json = await response.json();
              if (json?.data?.list?.length > 0) {
                profileData = json.data;
              }
            } catch {
              // ignore parse errors
            }
          } else if (url.includes("/live_api/baseuser/userinfo/byid") && !userInfo) {
            try {
              const json = await response.json();
              userInfo = json?.data?.userInfo;
            } catch {
              // ignore parse errors
            }
          }
        }
      });

      // 先访问主页再访问用户主页
      await page.goto("https://www.kuaishou.com", {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });

      // 再访问用户主页
      await page.goto(`https://live.kuaishou.com/profile/${principalId}`, {
        waitUntil: "networkidle",
        timeout: 30_000,
      });

      // 等待数据加载
      let retries = 0;
      while (!profileData && retries < 3) {
        await new Promise((r) => setTimeout(r, 2000));
        retries++;
        if (!profileData) {
          await page.reload({ waitUntil: "networkidle" });
        }
      }

      const list = profileData?.list ?? [];
      const items = list.slice(0, maxItems).map((item: any) => ({
        title: item.caption || item.title || "",
        description: `<video controls preload="metadata" poster="${item.poster || ""}"><source src="${item.playUrl || ""}" type="video/mp4"></video>`,
        link: `https://www.kuaishou.com/photo/${item.id || item.photoId || ""}`,
        guid: buildGuid("kuaishou", String(item.id || item.photoId || "")),
        pubDate: item.timestamp ? fromUnixTimestamp(item.timestamp) : new Date().toUTCString(),
        author: item.author?.name || userInfo?.name,
      }));

      return {
        rssXml: buildRssXml({
          title: `${userInfo?.name || principalId} - 快手`,
          link: `https://live.kuaishou.com/profile/${principalId}`,
          description: `快手用户 ${userInfo?.name || principalId} 的作品`,
          language: "zh-CN",
          items,
        }),
        metadata: { itemCount: items.length, platform: "kuaishou" },
      };
    } finally {
      await closeBrowser();
    }
  } finally {
    abortSignal.removeEventListener("abort", onAbort);
  }
};

// ─── Search（搜索） ──────────────────────────────────────────────

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

      let searchData: any = null;

      page.on("response", async (response: any) => {
        if (response.ok()) {
          const url = response.url();
          if (url.includes("/graphql") && !searchData) {
            try {
              const json = await response.json();
              if (json?.data?.searchSearchFeed?.items?.length > 0) {
                searchData = json.data.searchSearchFeed;
              }
            } catch {
              // ignore
            }
          }
        }
      });

      // 访问快手搜索页面
      await page.goto(`https://www.kuaishou.com/search?searchKey=${encodeURIComponent(keyword)}`, {
        waitUntil: "networkidle",
        timeout: 30_000,
      });

      // 等待搜索结果
      let retries = 0;
      while (!searchData && retries < 5) {
        await new Promise((r) => setTimeout(r, 2000));
        retries++;
      }

      const items = (searchData?.items ?? []).slice(0, maxItems).map((item: any) => {
        const photo = item.photo || item;
        return {
          title: photo.caption || "",
          description: photo.caption || "",
          link: `https://www.kuaishou.com/photo/${photo.photoId || photo.id || ""}`,
          guid: buildGuid("kuaishou", `search_${photo.photoId || photo.id || ""}`),
          pubDate: photo.timestamp ? fromUnixTimestamp(photo.timestamp) : new Date().toUTCString(),
          author: photo.user?.name,
        };
      });

      return {
        rssXml: buildRssXml({
          title: `${keyword} - 快手搜索`,
          link: `https://www.kuaishou.com/search?searchKey=${encodeURIComponent(keyword)}`,
          description: `快手搜索 - ${keyword}`,
          language: "zh-CN",
          items,
        }),
        metadata: { itemCount: items.length, platform: "kuaishou" },
      };
    } finally {
      await closeBrowser();
    }
  } finally {
    abortSignal.removeEventListener("abort", onAbort);
  }
};

// ─── 注册路由 ────────────────────────────────────────────────────

registerRoute("ks/profile", profileHandler);
registerRoute("ks/search", searchHandler);
