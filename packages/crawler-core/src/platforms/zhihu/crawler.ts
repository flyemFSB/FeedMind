import { AbstractCrawler, type CrawlerStore } from "../../core/abstract-crawler.js";
import type { CrawlerContext, ContentModel, CreatorModel, StoreResult } from "../../core/types.js";

/**
 * 知乎爬虫 — 通过 zhihu.com/api REST API 获取数据，需要 Cookie。
 */
const API_BASE = "https://www.zhihu.com/api/v4";
const COMMON_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  Referer: "https://www.zhihu.com",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "zh-CN,zh;q=0.9",
  "x-requested-with": "fetch",
};

interface ZhihuAnswer {
  id: number;
  url: string;
  content?: string;
  excerpt?: string;
  voteup_count?: number;
  comment_count?: number;
  created_time?: number;
  updated_time?: number;
  author?: {
    id: string;
    url_token: string;
    name: string;
    avatar_url: string;
    headline?: string;
    follower_count?: number;
    gender?: number;
  };
  question?: { id?: number; title?: string };
}

interface ZhihuSearchResult {
  data?: Array<{
    type: string;
    object?: ZhihuAnswer | { question?: { id?: number; title?: string; created?: number } };
  }>;
}

export class ZhihuCrawler extends AbstractCrawler {
  protected async execute(
    ctx: CrawlerContext,
    store: CrawlerStore,
  ): Promise<StoreResult> {
    const allContents: ContentModel[] = [];
    const allCreators: CreatorModel[] = [];

    if (ctx.crawlerType === "search" && ctx.keywords?.length) {
      for (const keyword of ctx.keywords) {
        if (this.abortSignal?.aborted) break;
        const result = await this.searchContent(keyword, ctx.maxNotes);
        allContents.push(...result.contents);
        allCreators.push(...result.creators);
      }
    } else if (ctx.crawlerType === "detail" && ctx.specifiedUrls?.length) {
      for (const url of ctx.specifiedUrls) {
        if (this.abortSignal?.aborted) break;
        const item = await this.getDetailFromUrl(url);
        if (item) allContents.push(item);
      }
    }

    const inserted = await store.saveContents(ctx.taskId, ctx.platform, allContents);
    const insertedCreators = await store.saveCreators(ctx.taskId, ctx.platform, allCreators);

    return { insertedContents: inserted, insertedCreators };
  }

  private async searchContent(
    keyword: string,
    maxResults: number,
  ): Promise<{ contents: ContentModel[]; creators: CreatorModel[] }> {
    const params = new URLSearchParams({
      q: keyword,
      search_source: "Normal",
      page: "1",
      limit: Math.min(maxResults, 20).toString(),
    });

    const data = await this.fetchApi<ZhihuSearchResult>(`/search_v3?${params}`);

    const contents: ContentModel[] = [];
    const creators: CreatorModel[] = [];

    for (const item of data.data ?? []) {
      if (item.type === "answer" || item.type === "article") {
        const obj = item.object as ZhihuAnswer | undefined;
        if (!obj?.id) continue;

        const qTitle = (obj as any).question?.title || (obj as any).title;

        contents.push({
          contentId: `zh_${obj.id}`,
          title: qTitle,
          desc: obj.excerpt || obj.content?.replace(/<[^>]+>/g, "").substring(0, 500),
          displayUrl: obj.url || `https://www.zhihu.com/question/${(obj as any).question?.id}/answer/${obj.id}`,
          authorId: obj.author?.id || obj.author?.url_token,
          authorName: obj.author?.name,
          authorAvatar: obj.author?.avatar_url,
          likeCount: obj.voteup_count,
          commentCount: obj.comment_count,
          publishedAt: obj.created_time ? new Date(obj.created_time * 1000).toISOString() : undefined,
          tag: keyword,
          rawJson: JSON.stringify(obj),
        });

        if (obj.author) {
          creators.push({
            creatorId: obj.author.id || obj.author.url_token,
            name: obj.author.name,
            avatar: obj.author.avatar_url,
            desc: obj.author.headline,
            followerCount: obj.author.follower_count,
            gender: obj.author.gender === 1 ? "male" : obj.author.gender === 0 ? "female" : undefined,
          });
        }
      }
    }

    return { contents, creators };
  }

  private async getDetailFromUrl(url: string): Promise<ContentModel | undefined> {
    const answerMatch = url.match(/zhihu\.com\/question\/\d+\/answer\/(\d+)/);
    const questionMatch = url.match(/zhihu\.com\/question\/(\d+)/);
    const articleMatch = url.match(/zhuanlan\.zhihu\.com\/p\/(\d+)/);
    const pinMatch = url.match(/zhihu\.com\/pin\/(\d+)/);

    if (answerMatch?.[1]) {
      return this.getAnswerDetail(parseInt(answerMatch[1], 10));
    }
    if (questionMatch?.[1]) {
      return this.getQuestionDetail(parseInt(questionMatch[1], 10));
    }
    if (articleMatch?.[1]) {
      return this.getArticleDetail(articleMatch[1], url);
    }
    if (pinMatch?.[1]) {
      return this.getPinDetail(pinMatch[1], url);
    }

    return undefined;
  }

  private async getAnswerDetail(answerId: number): Promise<ContentModel | undefined> {
    const data = await this.fetchApi<ZhihuAnswer & { question?: { id?: number; title?: string } }>(
      `/answers/${answerId}?include=content,excerpt,author,voteup_count,comment_count,created_time,updated_time,question`,
    );

    if (!data.id) return undefined;

    return {
      contentId: `zh_${data.id}`,
      title: data.question?.title,
      desc: data.excerpt || data.content?.replace(/<[^>]+>/g, "").substring(0, 500),
      displayUrl: `https://www.zhihu.com/question/${data.question?.id}/answer/${data.id}`,
      authorId: data.author?.id || data.author?.url_token,
      authorName: data.author?.name,
      authorAvatar: data.author?.avatar_url,
      likeCount: data.voteup_count,
      commentCount: data.comment_count,
      publishedAt: data.created_time ? new Date(data.created_time * 1000).toISOString() : undefined,
      rawJson: JSON.stringify(data),
    };
  }

  private async getQuestionDetail(questionId: number): Promise<ContentModel | undefined> {
    const data = await this.fetchApi<{
      id: number;
      title: string;
      detail?: string;
      answer_count?: number;
      follower_count?: number;
      created?: number;
    }>(`/questions/${questionId}?include=detail,answer_count,follower_count,created`);

    if (!data.id) return undefined;

    return {
      contentId: `qs_${data.id}`,
      title: data.title,
      desc: data.detail?.replace(/<[^>]+>/g, "").substring(0, 500),
      displayUrl: `https://www.zhihu.com/question/${data.id}`,
      publishedAt: data.created ? new Date(data.created * 1000).toISOString() : undefined,
      rawJson: JSON.stringify(data),
    };
  }

  private async getArticleDetail(articleId: string, originalUrl: string): Promise<ContentModel | undefined> {
    const data = await this.fetchApi<{
      id: string;
      title: string;
      content?: string;
      excerpt?: string;
      like_count?: number;
      comment_count?: number;
      created_time?: number;
      author?: { id: string; name: string; avatar_url: string };
    }>(`https://zhuanlan.zhihu.com/api/articles/${articleId}`);

    return {
      contentId: `art_${data.id}`,
      title: data.title,
      desc: data.excerpt || data.content?.replace(/<[^>]+>/g, "").substring(0, 500),
      displayUrl: originalUrl,
      authorId: data.author?.id,
      authorName: data.author?.name,
      authorAvatar: data.author?.avatar_url,
      likeCount: data.like_count,
      commentCount: data.comment_count,
      publishedAt: data.created_time ? new Date(data.created_time * 1000).toISOString() : undefined,
      rawJson: JSON.stringify(data),
    };
  }

  private async getPinDetail(pinId: string, originalUrl: string): Promise<ContentModel | undefined> {
    const data = await this.fetchApi<{
      id: number;
      content?: string[];
      excerpt?: string;
      like_count?: number;
      comment_count?: number;
      created_at?: number;
      author?: { id: string; name: string; avatar_url: string; headline?: string };
    }>(`/pins/${pinId}`);

    return {
      contentId: `pin_${data.id}`,
      desc: data.excerpt || data.content?.join("\n") || undefined,
      displayUrl: originalUrl,
      authorId: data.author?.id,
      authorName: data.author?.name,
      authorAvatar: data.author?.avatar_url,
      likeCount: data.like_count,
      commentCount: data.comment_count,
      publishedAt: data.created_at ? new Date(data.created_at * 1000).toISOString() : undefined,
      rawJson: JSON.stringify(data),
    };
  }

  private async fetchApi<T>(url: string): Promise<T> {
    const headers: Record<string, string> = { ...COMMON_HEADERS };
    if (this.cookies) headers.Cookie = this.cookies;

    const fullUrl = url.startsWith("http") ? url : `${API_BASE}${url}`;
    const res = await this.fetchWithAbort(fullUrl, { headers });

    if (!res.ok) {
      throw new Error(`ZH API ${res.status}: ${res.statusText}`);
    }

    return res.json() as Promise<T>;
  }
}
