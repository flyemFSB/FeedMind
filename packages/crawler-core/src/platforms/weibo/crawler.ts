import { AbstractCrawler, type CrawlerStore } from "../../core/abstract-crawler.js";
import type { CrawlerContext, ContentModel, CreatorModel, StoreResult } from "../../core/types.js";

/**
 * 微博爬虫 — 通过 weibo.com/ajax REST API 获取数据，需要 Cookie。
 */
const AJAX_BASE = "https://weibo.com/ajax";
const COMMON_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  Referer: "https://weibo.com",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "zh-CN,zh;q=0.9",
  "X-Requested-With": "XMLHttpRequest",
};

interface WeiboStatus {
  id: string;
  mid?: string;
  text?: string;
  text_raw?: string;
  title?: { text?: string };
  page_info?: { page_url?: string; media_info?: { name?: string } };
  pics?: Array<{ pid: string; url: string; large?: { url: string }; width?: number; height?: number }>;
  user?: {
    id: number;
    idstr: string;
    screen_name: string;
    profile_image_url: string;
    description?: string;
    followers_count?: number;
    friends_count?: number;
    statuses_count?: number;
    gender?: string;
  };
  attitudes_count?: number;
  reposts_count?: number;
  comments_count?: number;
  created_at?: string;
  retweeted_status?: WeiboStatus;
}

interface WeiboSearchResult {
  ok: number;
  data?: { list?: WeiboStatus[]; total?: number };
}

export class WeiboCrawler extends AbstractCrawler {
  protected async execute(
    ctx: CrawlerContext,
    store: CrawlerStore,
  ): Promise<StoreResult> {
    const allContents: ContentModel[] = [];
    const allCreators: CreatorModel[] = [];

    if (ctx.crawlerType === "search" && ctx.keywords?.length) {
      for (const keyword of ctx.keywords) {
        if (this.abortSignal?.aborted) break;
        const result = await this.searchStatus(keyword, ctx.maxNotes);
        allContents.push(...result.contents);
        allCreators.push(...result.creators);
      }
    } else if (ctx.crawlerType === "detail" && ctx.specifiedUrls?.length) {
      for (const url of ctx.specifiedUrls) {
        if (this.abortSignal?.aborted) break;
        const id = this.extractStatusId(url);
        if (id) {
          const item = await this.getStatusDetail(id);
          if (item) allContents.push(item);
        }
      }
    }

    const inserted = await store.saveContents(ctx.taskId, ctx.platform, allContents);
    const insertedCreators = await store.saveCreators(ctx.taskId, ctx.platform, allCreators);

    return { insertedContents: inserted, insertedCreators };
  }

  private extractStatusId(url: string): string | null {
    const patterns = [
      /weibo\.com\/\d+\/([a-zA-Z0-9]+)/,
      /weibo\.com\/detail\/([a-zA-Z0-9]+)/,
    ];
    for (const p of patterns) {
      const m = url.match(p);
      if (m?.[1]) return m[1];
    }
    return null;
  }

  private async searchStatus(
    keyword: string,
    maxResults: number,
  ): Promise<{ contents: ContentModel[]; creators: CreatorModel[] }> {
    const params = new URLSearchParams({
      page: "1",
      count: Math.min(maxResults, 50).toString(),
      q: keyword,
      typeall: "1",
      suball: "1",
    });

    const data = await this.fetchApi<WeiboSearchResult>(`/search/statuses?${params}`);

    const contents: ContentModel[] = [];
    const creators: CreatorModel[] = [];

    for (const st of data.data?.list ?? []) {
      const models = this.statusToModels(st, keyword);
      contents.push(...models.contents);
      creators.push(...models.creators);
    }

    return { contents, creators };
  }

  private async getStatusDetail(id: string): Promise<ContentModel | undefined> {
    const params = new URLSearchParams({ id });
    const data = await this.fetchApi<{ ok: number; data?: WeiboStatus }>(
      `/statuses/show?${params}`,
    );

    if (!data.data) return undefined;
    return this.statusToModels(data.data).contents[0];
  }

  private statusToModels(
    st: WeiboStatus,
    tag?: string,
  ): { contents: ContentModel[]; creators: CreatorModel[] } {
    const contents: ContentModel[] = [];
    const creators: CreatorModel[] = [];

    const images = st.pics?.map((p) => ({
      url: p.large?.url || p.url,
      width: p.width,
      height: p.height,
    }));
    const pageUrl = st.page_info?.page_url;
    const videoUrl = st.page_info?.media_info?.name
      ? `https://weibo.com/tv/show/${st.id}`
      : undefined;

    contents.push({
      contentId: st.mid || st.id,
      title: st.title?.text,
      desc: st.text_raw || st.text?.replace(/<[^>]+>/g, ""),
      displayUrl: pageUrl || `https://weibo.com/${st.user?.id}/${st.mid || st.id}`,
      images,
      videoUrl,
      authorId: st.user?.idstr,
      authorName: st.user?.screen_name,
      authorAvatar: st.user?.profile_image_url,
      likeCount: st.attitudes_count,
      shareCount: st.reposts_count,
      commentCount: st.comments_count,
      publishedAt: st.created_at ? new Date(st.created_at).toISOString() : undefined,
      tag,
      rawJson: JSON.stringify(st),
    });

    if (st.user) {
      creators.push({
        creatorId: st.user.idstr,
        name: st.user.screen_name,
        avatar: st.user.profile_image_url,
        desc: st.user.description,
        followerCount: st.user.followers_count,
        followingCount: st.user.friends_count,
        noteCount: st.user.statuses_count,
        gender: st.user.gender === "m" ? "male" : st.user.gender === "f" ? "female" : undefined,
      });
    }

    if (st.retweeted_status) {
      const rt = st.retweeted_status;
      contents.push({
        contentId: `rt_${rt.mid || rt.id}`,
        desc: rt.text_raw || rt.text?.replace(/<[^>]+>/g, ""),
        displayUrl: `https://weibo.com/${rt.user?.id}/${rt.mid || rt.id}`,
        authorId: rt.user?.idstr,
        authorName: rt.user?.screen_name,
        authorAvatar: rt.user?.profile_image_url,
        likeCount: rt.attitudes_count,
        shareCount: rt.reposts_count,
        commentCount: rt.comments_count,
        rawJson: JSON.stringify(rt),
      });
    }

    return { contents, creators };
  }

  private async fetchApi<T>(path: string): Promise<T> {
    const headers: Record<string, string> = { ...COMMON_HEADERS };
    if (this.cookies) headers.Cookie = this.cookies;

    const res = await this.fetchWithAbort(`${AJAX_BASE}${path}`, { headers });

    if (!res.ok) {
      throw new Error(`WB API ${res.status}: ${res.statusText}`);
    }

    return res.json() as Promise<T>;
  }
}
