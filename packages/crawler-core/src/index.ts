// ─── 路由（自动注册） ──────────────────────────────────────────
import "./routes/index.js";

// ─── 核心 ─────────────────────────────────────────────────────────
export { createBrowser, closeBrowser } from "./core/browser.js";
export { buildRssXml, buildGuid, toRfc2822, fromUnixTimestamp } from "./core/rss-builder.js";
export type { RssFeed, RssItem } from "./core/rss-builder.js";
export { registerRoute, getRouteHandler, listRoutes } from "./core/route-registry.js";
export type { RouteHandlerParams, RouteHandlerResult, RouteHandler } from "./core/types.js";
