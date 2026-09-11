// ─── 站点适配器（自动注册） ────────────────────────────────────
import "./sites/index.js";

// ─── 核心 ─────────────────────────────────────────────────────────
export {
  createBrowser,
  closeBrowser,
  setMarkedWindowFactory,
  setMarkedWindowDestroyer,
  ensureMarkedWindow,
  destroyMarkedWindow,
  assertElectronCdp,
} from "./core/browser.js";
export type { MarkedWindowFactory, MarkedWindowDestroyer } from "./core/browser.js";
export { CrawlerAuthError } from "./core/errors.js";
export { buildRssXml, buildGuid, toRfc2822, fromUnixTimestamp } from "./core/rss-builder.js";
export { registerRoute, getRouteHandler } from "./core/route-registry.js";
export type { RouteHandlerParams, RouteHandler } from "./core/types.js";
