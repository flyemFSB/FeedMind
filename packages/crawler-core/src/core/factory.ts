import type { Platform } from "@feedmind/contracts";
import { AbstractCrawler } from "./abstract-crawler.js";
import { TiebaCrawler } from "../platforms/tieba/crawler.js";
import { XhsCrawler } from "../platforms/xhs/crawler.js";
import { DouyinCrawler } from "../platforms/douyin/crawler.js";
import { BilibiliCrawler } from "../platforms/bilibili/crawler.js";
import { WeiboCrawler } from "../platforms/weibo/crawler.js";
import { ZhihuCrawler } from "../platforms/zhihu/crawler.js";
import { KuaishouCrawler } from "../platforms/kuaishou/crawler.js";

/** Registry: platform → crawler factory function */
type CrawlerFactoryFn = (
  cookies?: string,
  proxyUrl?: string,
  abortSignal?: AbortSignal,
) => AbstractCrawler;

const registry = new Map<string, CrawlerFactoryFn>();

// Register all built-in crawlers
registry.set("xhs", (c, p, s) => new XhsCrawler(c, p, s));
registry.set("dy", (c, p, s) => new DouyinCrawler(c, p, s));
registry.set("bili", (c, p, s) => new BilibiliCrawler(c, p, s));
registry.set("wb", (c, p, s) => new WeiboCrawler(c, p, s));
registry.set("zhihu", (c, p, s) => new ZhihuCrawler(c, p, s));
registry.set("ks", (c, p, s) => new KuaishouCrawler(c, p, s));
registry.set("tieba", (c, p, s) => new TiebaCrawler(c, p, s));

/**
 * Create a crawler instance for the given platform.
 * Throws if the platform is not implemented.
 */
export function createCrawler(
  platform: Platform,
  cookies?: string,
  proxyUrl?: string,
  abortSignal?: AbortSignal,
): AbstractCrawler {
  const factory = registry.get(platform);
  if (!factory) {
    throw new Error(`Crawler for platform "${platform}" is not implemented yet`);
  }
  return factory(cookies, proxyUrl, abortSignal);
}

/** Check whether a platform crawler is implemented. */
export function isPlatformImplemented(platform: Platform): boolean {
  return registry.has(platform);
}
