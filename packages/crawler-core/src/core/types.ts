import type { Platform, CrawlerType } from "@feedmind/contracts";

// ─── 爬虫上下文 ─────────────────────────────────────────────────
// 启动时由服务传递给每个爬虫实例
export interface CrawlerContext {
  taskId: string;
  platform: Platform;
  crawlerType: CrawlerType;
  keywords?: string[];
  specifiedUrls?: string[];
  creatorIds?: string[];
  cookies?: string;
  proxyUrl?: string;
  maxNotes: number;
  maxConcurrency: number;
  enableMedia: boolean;
  abortSignal: AbortSignal;
}

// ─── 统一内容模型 ─────────────────────────────────────────────────
export interface ContentModel {
  contentId: string;
  title?: string;
  desc?: string;
  displayUrl?: string;
  images?: { url: string; width?: number; height?: number }[];
  videoUrl?: string;
  videoCoverUrl?: string;
  authorId?: string;
  authorName?: string;
  authorAvatar?: string;
  likeCount?: number;
  collectCount?: number;
  commentCount?: number;
  shareCount?: number;
  publishedAt?: string;
  tag?: string;
  rawJson?: string;
}

// ─── 统一创作者模型 ───────────────────────────────────────────────
export interface CreatorModel {
  creatorId: string;
  name?: string;
  avatar?: string;
  desc?: string;
  followerCount?: number;
  followingCount?: number;
  noteCount?: number;
  gender?: string;
  rawJson?: string;
}

// ─── 存储结果 ─────────────────────────────────────────────────────
export interface StoreResult {
  insertedContents: number;
  insertedCreators: number;
}

// ─── 平台爬虫类型 ─────────────────────────────────────────────────
// 各平台支持的爬虫类型列表
export const PLATFORM_CRAWLER_TYPES: Record<Platform, CrawlerType[]> = {
  xhs: ["search", "detail", "creator"],
  dy: ["search", "detail", "creator"],
  bili: ["search", "detail", "creator"],
  wb: ["search", "detail"],
  zhihu: ["search", "detail"],
  ks: ["search", "detail"],
  tieba: ["search", "detail"],
};
