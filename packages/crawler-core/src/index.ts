// ─── 路由（自动注册） ──────────────────────────────────────────
import "./routes/index.js";

// ─── 核心 ─────────────────────────────────────────────────────────
export { createBrowser, closeBrowser, assertElectronCdp } from "./core/browser.js";
export { checkCookie, refreshWereadCookies } from "./core/check-cookie.js";
export { CrawlerAuthError } from "./core/errors.js";
export { buildRssXml, buildGuid, toRfc2822, fromUnixTimestamp } from "./core/rss-builder.js";
export { registerRoute, getRouteHandler } from "./core/route-registry.js";
export type { RouteHandlerParams, RouteHandler } from "./core/types.js";
