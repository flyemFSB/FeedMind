import { AbstractCrawler, type CrawlerStore } from "../../core/abstract-crawler.js";
import type { CrawlerContext, ContentModel, CreatorModel, StoreResult } from "../../core/types.js";

/**
 * 快手爬虫 — 通过 kuaishou.com GraphQL API 获取数据，需要 Cookie。
 */
const GRAPHQL_URL = "https://www.kuaishou.com/graphql";
const COMMON_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  Referer: "https://www.kuaishou.com/",
  "Content-Type": "application/json",
  Accept: "*/*",
  "Accept-Language": "zh-CN,zh;q=0.9",
};

interface KsPhotoData {
  id?: string;
  photoId?: string;
  caption?: string;
  coverUrl?: string;
  videoUrl?: string;
  timestamp?: number;
  user?: {
    id: string;
    name: string;
    avatar?: string;
    following?: number;
    followers?: number;
  };
  likedCount?: number;
  commentCount?: number;
  viewCount?: number;
}

interface KsGraphQLResponse {
  data?: {
    searchSearchFeed?: {
      items?: Array<{ photo?: KsPhotoData; author?: KsPhotoData["user"] }>;
    };
    visionVideoDetail?: {
      photo?: KsPhotoData;
    };
  };
}

export class KuaishouCrawler extends AbstractCrawler {
  protected async execute(
    ctx: CrawlerContext,
    store: CrawlerStore,
  ): Promise<StoreResult> {
    const allContents: ContentModel[] = [];
    const allCreators: CreatorModel[] = [];

    if (ctx.crawlerType === "search" && ctx.keywords?.length) {
      for (const keyword of ctx.keywords) {
        if (this.abortSignal?.aborted) break;
        const result = await this.searchPhoto(keyword, ctx.maxNotes);
        allContents.push(...result.contents);
        allCreators.push(...result.creators);
      }
    } else if (ctx.crawlerType === "detail" && ctx.specifiedUrls?.length) {
      for (const url of ctx.specifiedUrls) {
        if (this.abortSignal?.aborted) break;
        const photoId = this.extractPhotoId(url);
        if (photoId) {
          const item = await this.getPhotoDetail(photoId);
          if (item) allContents.push(item);
        }
      }
    }

    const inserted = await store.saveContents(ctx.taskId, ctx.platform, allContents);
    const insertedCreators = await store.saveCreators(ctx.taskId, ctx.platform, allCreators);

    return { insertedContents: inserted, insertedCreators };
  }

  private extractPhotoId(url: string): string | null {
    const patterns = [
      /kuaishou\.com\/photo\/(\d+)/,
      /kuaishou\.com\/short-video\/(\w+)/,
      /kuaishou\.com\/note\/(\w+)/,
    ];
    for (const p of patterns) {
      const m = url.match(p);
      if (m?.[1]) return m[1];
    }
    return null;
  }

  private async searchPhoto(
    keyword: string,
    maxResults: number,
  ): Promise<{ contents: ContentModel[]; creators: CreatorModel[] }> {
    const query = `
      query searchSearchFeed($keyword: String, $pageParam: String) {
        searchSearchFeed(keyword: $keyword, pageParam: $pageParam) {
          items {
            photo {
              id
              photoId
              caption
              coverUrl
              videoUrl
              timestamp
              likedCount
              commentCount
              viewCount
              user {
                id
                name
                avatar
                following
                followers
              }
            }
          }
        }
      }
    `;

    const data = await this.graphql<KsGraphQLResponse>(query, { keyword, pageParam: "" });

    const contents: ContentModel[] = [];
    const creators: CreatorModel[] = [];

    for (const item of data?.data?.searchSearchFeed?.items ?? []) {
      const p = item.photo;
      if (!p?.photoId) continue;

      contents.push({
        contentId: p.photoId,
        title: p.caption,
        desc: p.caption,
        displayUrl: `https://www.kuaishou.com/photo/${p.photoId}`,
        videoUrl: p.videoUrl,
        videoCoverUrl: p.coverUrl,
        authorId: p.user?.id,
        authorName: p.user?.name,
        authorAvatar: p.user?.avatar,
        likeCount: p.likedCount,
        commentCount: p.commentCount,
        publishedAt: p.timestamp ? new Date(p.timestamp * 1000).toISOString() : undefined,
        tag: keyword,
        rawJson: JSON.stringify(p),
      });

      if (p.user) {
        creators.push({
          creatorId: p.user.id,
          name: p.user.name,
          avatar: p.user.avatar,
          followerCount: p.user.followers,
          followingCount: p.user.following,
        });
      }
    }

    return { contents, creators };
  }

  private async getPhotoDetail(photoId: string): Promise<ContentModel | undefined> {
    const query = `
      query visionVideoDetail($photoId: String) {
        visionVideoDetail(photoId: $photoId) {
          photo {
            id
            photoId
            caption
            coverUrl
            videoUrl
            timestamp
            likedCount
            commentCount
            viewCount
            user {
              id
              name
              avatar
              following
              followers
            }
          }
        }
      }
    `;

    const data = await this.graphql<KsGraphQLResponse>(query, { photoId });
    const p = data?.data?.visionVideoDetail?.photo;
    if (!p?.photoId) return undefined;

    return {
      contentId: p.photoId,
      title: p.caption,
      desc: p.caption,
      displayUrl: `https://www.kuaishou.com/photo/${p.photoId}`,
      videoUrl: p.videoUrl,
      videoCoverUrl: p.coverUrl,
      authorId: p.user?.id,
      authorName: p.user?.name,
      authorAvatar: p.user?.avatar,
      likeCount: p.likedCount,
      commentCount: p.commentCount,
      publishedAt: p.timestamp ? new Date(p.timestamp * 1000).toISOString() : undefined,
      rawJson: JSON.stringify(p),
    };
  }

  private async graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const headers: Record<string, string> = { ...COMMON_HEADERS };
    if (this.cookies) headers.Cookie = this.cookies;

    const res = await this.fetchWithAbort(GRAPHQL_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        operationName: query.match(/query\s+(\w+)/)?.[1] || "query",
        query,
        variables,
      }),
    });

    if (!res.ok) {
      throw new Error(`KS GraphQL ${res.status}: ${res.statusText}`);
    }

    return res.json() as Promise<T>;
  }
}
