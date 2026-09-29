import { getRouteHandler, CrawlerAuthError } from "@feedmind/crawler-core";
import { HttpError } from "../../lib/http.js";
import { logger } from "../../lib/logger.js";
import { getPlatformCookies, setPlatformCookieValid } from "../cookie-cloud/service.js";

/**
 * 通用：调路由并解析 RSS item（title=名称，description=id），返回选项列表。
 * 仅服务订阅源表单的下拉选项；一次性爬取任务已随 crawl_run 表一并删除。
 */
async function listRouteOptions(
  route: string,
  platform: string,
): Promise<{ name: string; id: string }[]> {
  const cookies = (await getPlatformCookies(platform)) ?? undefined;

  const handler = getRouteHandler(route);
  if (!handler) {
    // 路由未注册属于内部配置错误，不向用户暴露内部路由名；细节进 details 供日志排查
    throw new HttpError(
      500,
      "ROUTE_MISSING",
      "爬取任务执行失败，请重试",
      { route },
      {
        i18nKey: "apiError.crawlerRouteMissing",
      },
    );
  }

  try {
    const result = await handler({
      params: {},
      abortSignal: new AbortController().signal,
      maxItems: 100,
      ...(cookies !== undefined ? { cookies } : {}),
    });

    // 实际拉取成功是登录态可用的最强证据：回写有效状态让面板自愈
    await setPlatformCookieValid(platform, true);

    return [...result.rssXml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((m) => {
      const block = m[1] ?? "";
      const titleMatch = block.match(/<title>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/title>/i);
      const descMatch = block.match(
        /<description>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/description>/i,
      );
      // 组 1 为 CDATA 分支，组 2 为普通文本分支，两者都可能命中
      return {
        name: (titleMatch?.[1] ?? titleMatch?.[2] ?? "").trim(),
        id: (descMatch?.[1] ?? descMatch?.[2] ?? "").trim(),
      };
    });
  } catch (err) {
    // 登录态失效：落库标记 + 透出 401，让前端能提示而非静默空列表
    if (err instanceof CrawlerAuthError) {
      await setPlatformCookieValid(platform, false);
      throw new HttpError(
        401,
        "COOKIE_EXPIRED",
        `${platform} Cookie 已失效，请重新同步`,
        {},
        { i18nKey: "apiError.crawlerCookieExpired", i18nParams: { platform } },
      );
    }
    // 其他失败（网络波动/风控）降级返回空列表，避免 500
    logger.warn({ err, route, platform }, "拉取选项列表失败，已降级返回空列表");
    return [];
  }
}

/** 微信读书书架公众号列表 */
export const listWereadMps = (): Promise<{ name: string; id: string }[]> =>
  listRouteOptions("weread/mps", "weread");
/** B站当前登录用户收藏夹列表 */
export const listBiliFavs = (): Promise<{ name: string; id: string }[]> =>
  listRouteOptions("bili/favs", "bilibili");
/** 知乎当前登录用户收藏夹列表 */
export const listZhCollections = (): Promise<{ name: string; id: string }[]> =>
  listRouteOptions("zh/collections", "zhihu");
