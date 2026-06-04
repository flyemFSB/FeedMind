import type { Platform, CrawlerType } from "@feedmind/contracts";

// ─── Crawler Context ──────────────────────────────────────────────
// Passed from service to each crawler instance at start time
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

// ─── Unified Content Model ────────────────────────────────────────
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

// ─── Unified Creator Model ────────────────────────────────────────
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

// ─── Store Result ─────────────────────────────────────────────────
export interface StoreResult {
  insertedContents: number;
  insertedCreators: number;
}

// ─── Platform Crawler Types ───────────────────────────────────────
// Which crawler types each platform supports
export const PLATFORM_CRAWLER_TYPES: Record<Platform, CrawlerType[]> = {
  xhs: ["search", "detail", "creator"],
  dy: ["search", "detail", "creator"],
  bili: ["search", "detail", "creator"],
  wb: ["search", "detail"],
  zhihu: ["search", "detail"],
  ks: ["search", "detail"],
  tieba: ["search", "detail"],
};
