import { AbstractCrawler, type CrawlerStore } from "../../core/abstract-crawler.js";
import type { CrawlerContext, ContentModel, CreatorModel, StoreResult } from "../../core/types.js";

/**
 * B站爬虫 — 通过 api.bilibili.com REST API 获取数据，需要 Cookie。
 */
const API_BASE = "https://api.bilibili.com";
const COMMON_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  Referer: "https://www.bilibili.com",
  "Accept-Language": "zh-CN,zh;q=0.9",
};

interface BiliSearchResult {
  code: number;
  data?: {
    result?: Array<{
      type: string;
      aid?: number;
      bvid?: string;
      title?: string;
      description?: string;
      pic?: string;
      author?: string;
      mid?: number;
      upic?: string;
      play?: number;
      video_review?: number;
      favorites?: number;
      like?: number;
      pubdate?: number;
      tag?: string;
    }>;
    page?: { num: number; size: number; total: number };
  };
}

interface BiliSpaceResult {
  code: number;
  data?: {
    list?: {
      vlist?: Array<{
        aid: number;
        bvid: string;
        title: string;
        description: string;
        pic: string;
        play: number;
        video_review: number;
        mid: number;
        author: string;
        created: number;
      }>;
    };
    page?: { count: number; pn: number; ps: number };
  };
}

export class BilibiliCrawler extends AbstractCrawler {
  protected async execute(
    ctx: CrawlerContext,
    store: CrawlerStore,
  ): Promise<StoreResult> {
    const allContents: ContentModel[] = [];
    const allCreators: CreatorModel[] = [];

    if (ctx.crawlerType === "search" && ctx.keywords?.length) {
      for (const keyword of ctx.keywords) {
        if (this.abortSignal?.aborted) break;
        const items = await this.searchVideo(keyword, ctx.maxNotes);
        allContents.push(...items.contents);
        allCreators.push(...items.creators);
      }
    } else if (ctx.crawlerType === "detail" && ctx.specifiedUrls?.length) {
      for (const url of ctx.specifiedUrls) {
        if (this.abortSignal?.aborted) break;
        const bvid = this.extractBvid(url);
        if (bvid) {
          const item = await this.getVideoDetail(bvid);
          if (item) allContents.push(item);
        }
      }
    } else if (ctx.crawlerType === "creator" && ctx.creatorIds?.length) {
      for (const uid of ctx.creatorIds) {
        if (this.abortSignal?.aborted) break;
        const items = await this.getCreatorVideos(uid, ctx.maxNotes);
        allContents.push(...items);
      }
    }

    const inserted = await store.saveContents(ctx.taskId, ctx.platform, allContents);
    const insertedCreators = await store.saveCreators(ctx.taskId, ctx.platform, allCreators);

    return { insertedContents: inserted, insertedCreators };
  }

  private extractBvid(url: string): string | null {
    const m = url.match(/(?:bilibili\.com\/video\/)(BV\w+)/);
    return m?.[1] ?? null;
  }

  private async searchVideo(
    keyword: string,
    maxResults: number,
  ): Promise<{ contents: ContentModel[]; creators: CreatorModel[] }> {
    const params = new URLSearchParams({
      search_type: "video",
      keyword,
      page: "1",
      page_size: Math.min(maxResults, 50).toString(),
    });

    const data = await this.fetchApi<BiliSearchResult>(`/x/web-interface/search/type?${params}`);

    const contents: ContentModel[] = [];
    const creators: CreatorModel[] = [];

    for (const item of data.data?.result ?? []) {
      if (item.type !== "video" || !item.bvid) continue;
      contents.push({
        contentId: item.bvid,
        title: item.title?.replace(/<[^>]+>/g, "") || undefined,
        desc: item.description,
        displayUrl: `https://www.bilibili.com/video/${item.bvid}`,
        videoCoverUrl: item.pic,
        authorId: item.mid?.toString(),
        authorName: item.author,
        authorAvatar: item.upic,
        likeCount: item.like,
        commentCount: item.video_review,
        publishedAt: item.pubdate ? new Date(item.pubdate * 1000).toISOString() : undefined,
        tag: item.tag || keyword,
        rawJson: JSON.stringify(item),
      });
      if (item.mid) {
        creators.push({
          creatorId: item.mid.toString(),
          name: item.author,
          avatar: item.upic,
        });
      }
    }

    return { contents, creators };
  }

  private async getVideoDetail(bvid: string): Promise<ContentModel | undefined> {
    const data = await this.fetchApi<{
      code: number;
      data?: {
        aid: number;
        bvid: string;
        title?: string;
        desc?: string;
        pic?: string;
        owner?: { mid: number; name: string; face: string };
        stat?: {
          view?: number;
          like?: number;
          coin?: number;
          favorite?: number;
          share?: number;
          reply?: number;
          danmaku?: number;
        };
        pubdate?: number;
      };
    }>(`/x/web-interface/view?bvid=${bvid}`);

    const v = data.data;
    if (!v) return undefined;

    return {
      contentId: v.bvid || String(v.aid),
      title: v.title,
      desc: v.desc,
      displayUrl: `https://www.bilibili.com/video/${v.bvid}`,
      videoCoverUrl: v.pic,
      authorId: v.owner?.mid?.toString(),
      authorName: v.owner?.name,
      authorAvatar: v.owner?.face,
      likeCount: v.stat?.like,
      collectCount: v.stat?.favorite,
      commentCount: v.stat?.reply,
      shareCount: v.stat?.share,
      publishedAt: v.pubdate ? new Date(v.pubdate * 1000).toISOString() : undefined,
      rawJson: JSON.stringify(v),
    };
  }

  private async getCreatorVideos(uid: string, maxResults: number): Promise<ContentModel[]> {
    const params = new URLSearchParams({
      mid: uid,
      ps: Math.min(maxResults, 50).toString(),
      pn: "1",
    });

    const data = await this.fetchApi<BiliSpaceResult>(`/x/space/arc/search?${params}`);

    return (data.data?.list?.vlist ?? []).map((v) => ({
      contentId: v.bvid || String(v.aid),
      title: v.title,
      desc: v.description,
      displayUrl: `https://www.bilibili.com/video/${v.bvid}`,
      videoCoverUrl: v.pic,
      authorId: v.mid?.toString(),
      authorName: v.author,
      likeCount: v.play,
      commentCount: v.video_review,
      publishedAt: v.created ? new Date(v.created * 1000).toISOString() : undefined,
      rawJson: JSON.stringify(v),
    }));
  }

  private async fetchApi<T>(path: string): Promise<T> {
    const headers: Record<string, string> = { ...COMMON_HEADERS };
    if (this.cookies) headers.Cookie = this.cookies;

    const res = await this.fetchWithAbort(`${API_BASE}${path}`, { headers });

    if (!res.ok) {
      throw new Error(`BILI API ${res.status}: ${res.statusText}`);
    }

    const data = (await res.json()) as T;
    if (typeof (data as any).code === "number" && (data as any).code !== 0) {
      throw new Error(`BILI API error: ${(data as any).code} - ${(data as any).message || "unknown"}`);
    }

    return data;
  }
}
