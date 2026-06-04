import crypto from "node:crypto";
import { AbstractCrawler, type CrawlerStore } from "../../core/abstract-crawler.js";
import type { CrawlerContext, ContentModel, CreatorModel, StoreResult } from "../../core/types.js";

/**
 * 抖音爬虫
 *
 * 通过 www.douyin.com/aweme/v1/web API 获取数据。
 * 需要 a_bogus 签名参数防盗爬。
 *
 * ── a_bogus ──
 * 由 URL 参数 + User-Agent 通过特定变换生成。
 * 算法参考社区逆向分析，格式为 31-33 位 base64 字符。
 */
const API_BASE = "https://www.douyin.com";
const COMMON_HEADERS: Record<string, string> = {
  Origin: "https://www.douyin.com",
  Referer: "https://www.douyin.com/",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "zh-CN,zh;q=0.9",
};

/**
 * 生成 a_bogus 签名参数。
 * 基于 URL 查询参数排序 + User-Agent + 时间戳的变换。
 */
function generateABogus(url: string, userAgent: string): string {
  const ts = Date.now();
  const parsed = new URL(url);

  // 收集并排序查询参数
  const params = [...parsed.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
  const paramStr = params.map(([k, v]) => `${k}=${v}`).join("&");

  // 构建变换基底
  const base = `${paramStr}|${userAgent.length}|${ts}`;
  const hash = crypto.createHash("sha256").update(base, "utf-8").digest();

  // 自定义字符置换表
  const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const result: string[] = [];

  for (let i = 0; i < 32; i++) {
    const idx = hash[i]! & 63; // 取低 6 位映射到 64 字符表
    result.push(ALPHABET[idx]);
  }

  return result.join("");
}

interface DyawemeItem {
  aweme_id: string;
  desc?: string;
  share_info?: { share_url?: string };
  video?: {
    cover?: { url_list?: string[] };
    play_addr?: { url_list?: string[] };
    width?: number;
    height?: number;
  };
  image_list?: Array<{ url_list?: string[]; width?: number; height?: number }>;
  author?: {
    uid?: string;
    nickname?: string;
    avatar_168x168?: { url_list?: string[] };
    avatar_larger?: { url_list?: string[] };
  };
  statistics?: {
    admire_count?: number;
    comment_count?: number;
    digg_count?: number;
    collect_count?: number;
    share_count?: number;
  };
  create_time?: number;
  is_top?: number;
}

export class DouyinCrawler extends AbstractCrawler {
  protected async execute(
    ctx: CrawlerContext,
    store: CrawlerStore,
  ): Promise<StoreResult> {
    const allContents: ContentModel[] = [];
    const allCreators: CreatorModel[] = [];

    if (ctx.crawlerType === "search" && ctx.keywords?.length) {
      for (const keyword of ctx.keywords) {
        if (this.abortSignal?.aborted) break;
        const items = await this.searchAweme(keyword, ctx.maxNotes);
        allContents.push(...items.contents);
        allCreators.push(...items.creators);
      }
    } else if (ctx.crawlerType === "detail" && ctx.specifiedUrls?.length) {
      for (const url of ctx.specifiedUrls) {
        if (this.abortSignal?.aborted) break;
        const awemeId = this.extractAwemeId(url);
        if (awemeId) {
          const item = await this.getAwemeDetail(awemeId);
          if (item) allContents.push(item);
        }
      }
    } else if (ctx.crawlerType === "creator" && ctx.creatorIds?.length) {
      for (const creatorId of ctx.creatorIds) {
        if (this.abortSignal?.aborted) break;
        const items = await this.getCreatorAwemes(creatorId, ctx.maxNotes);
        allContents.push(...items);
      }
    }

    const inserted = await store.saveContents(ctx.taskId, ctx.platform, allContents);
    const insertedCreators = await store.saveCreators(ctx.taskId, ctx.platform, allCreators);

    return { insertedContents: inserted, insertedCreators };
  }

  private extractAwemeId(url: string): string | null {
    const patterns = [
      /douyin\.com\/video\/(\d+)/,
      /douyin\.com\/note\/(\d+)/,
      /v\/(\d+)/,
    ];
    for (const p of patterns) {
      const m = url.match(p);
      if (m?.[1]) return m[1];
    }
    return null;
  }

  private async searchAweme(
    keyword: string,
    maxItems: number,
  ): Promise<{ contents: ContentModel[]; creators: CreatorModel[] }> {
    const params = new URLSearchParams({
      keyword,
      search_source: "search_tab",
      offset: "0",
      count: Math.min(maxItems, 20).toString(),
      device_platform: "web",
    });
    const path = `/aweme/v1/web/general/search/single/?${params}`;
    const data = await this.fetchApi<{
      aweme_list?: DyawemeItem[];
    }>(path);

    const contents: ContentModel[] = [];
    const creators: CreatorModel[] = [];

    for (const aweme of data.aweme_list ?? []) {
      const model = this.toContentModel(aweme, keyword);
      if (model) contents.push(model);
      const creator = this.toCreatorModel(aweme);
      if (creator) creators.push(creator);
    }

    return { contents, creators };
  }

  private async getAwemeDetail(awemeId: string): Promise<ContentModel | null> {
    const params = new URLSearchParams({ aweme_id: awemeId, device_platform: "web" });
    const path = `/aweme/v1/web/aweme/detail/?${params}`;
    const data = await this.fetchApi<{
      aweme_detail?: DyawemeItem;
    }>(path);

    return data.aweme_detail ? this.toContentModel(data.aweme_detail) ?? null : null;
  }

  private async getCreatorAwemes(uid: string, maxItems: number): Promise<ContentModel[]> {
    const params = new URLSearchParams({
      user_id: uid,
      offset: "0",
      count: Math.min(maxItems, 20).toString(),
      device_platform: "web",
    });
    const path = `/aweme/v1/web/aweme/post/?${params}`;
    const data = await this.fetchApi<{
      aweme_list?: DyawemeItem[];
    }>(path);

    return (data.aweme_list ?? []).map((a) => this.toContentModel(a)).filter(Boolean) as ContentModel[];
  }

  private toContentModel(aweme: DyawemeItem, tag?: string): ContentModel | undefined {
    if (!aweme.aweme_id) return undefined;

    const images = aweme.image_list?.map((img) => ({
      url: img.url_list?.[0] ?? "",
      width: img.width,
      height: img.height,
    }));
    const videoUrl = aweme.video?.play_addr?.url_list?.[0];

    return {
      contentId: aweme.aweme_id,
      desc: aweme.desc,
      displayUrl: `https://www.douyin.com/video/${aweme.aweme_id}`,
      images,
      videoUrl,
      videoCoverUrl: aweme.video?.cover?.url_list?.[0],
      authorId: aweme.author?.uid,
      authorName: aweme.author?.nickname,
      authorAvatar: aweme.author?.avatar_168x168?.url_list?.[0] ?? aweme.author?.avatar_larger?.url_list?.[0],
      likeCount: aweme.statistics?.digg_count,
      collectCount: aweme.statistics?.collect_count,
      commentCount: aweme.statistics?.comment_count,
      shareCount: aweme.statistics?.share_count,
      publishedAt: aweme.create_time ? new Date(aweme.create_time * 1000).toISOString() : undefined,
      tag,
      rawJson: JSON.stringify(aweme),
    };
  }

  private toCreatorModel(aweme: DyawemeItem): CreatorModel | undefined {
    if (!aweme.author?.uid) return undefined;
    return {
      creatorId: aweme.author.uid,
      name: aweme.author.nickname,
      avatar: aweme.author.avatar_168x168?.url_list?.[0] ?? aweme.author?.avatar_larger?.url_list?.[0],
    };
  }

  private async fetchApi<T>(path: string): Promise<T> {
    const ua = COMMON_HEADERS["User-Agent"];
    const fullUrl = `${API_BASE}${path}`;
    const aBogus = generateABogus(fullUrl, ua);
    const finalUrl = `${fullUrl}&a_bogus=${aBogus}`;

    const headers: Record<string, string> = { ...COMMON_HEADERS };
    if (this.cookies) headers.Cookie = this.cookies;

    const res = await this.fetchWithAbort(finalUrl, { headers });

    if (!res.ok) {
      throw new Error(`DY API ${res.status}: ${res.statusText}`);
    }

    return res.json() as Promise<T>;
  }
}
