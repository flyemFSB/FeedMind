import * as cheerio from "cheerio";
import { ProxyAgent } from "undici";
import { AbstractCrawler, type CrawlerStore } from "../../core/abstract-crawler.js";
import type { CrawlerContext, ContentModel, StoreResult } from "../../core/types.js";

/**
 * 贴吧爬虫 — 最简单的平台实现
 *
 * 贴吧无需登录，通过 HTTP 请求搜索页面，用 cheerio 解析 HTML。
 */
export class TiebaCrawler extends AbstractCrawler {
  private baseUrl = "https://tieba.baidu.com";

  protected async execute(
    ctx: CrawlerContext,
    store: CrawlerStore,
  ): Promise<StoreResult> {
    const allContents: ContentModel[] = [];

    if (ctx.crawlerType === "search" && ctx.keywords?.length) {
      for (const keyword of ctx.keywords) {
        if (this.abortSignal?.aborted) break;
        const posts = await this.searchPosts(keyword, ctx.maxNotes);
        allContents.push(...posts);
      }
    } else if (ctx.crawlerType === "detail" && ctx.specifiedUrls?.length) {
      for (const url of ctx.specifiedUrls) {
        if (this.abortSignal?.aborted) break;
        const posts = await this.getDetailFromUrl(url);
        allContents.push(...posts);
      }
    }

    const inserted = await store.saveContents(ctx.taskId, ctx.platform, allContents);

    return { insertedContents: inserted, insertedCreators: 0 };
  }

  private async searchPosts(
    keyword: string,
    maxNotes: number,
  ): Promise<ContentModel[]> {
    const url = `${this.baseUrl}/f/search/res?ie=utf-8&kw=&qw=${encodeURIComponent(keyword)}&rn=${Math.min(maxNotes, 50)}`;
    const html = await this.fetchHtml(url);
    return this.parseSearchResults(html, keyword);
  }

  private async getDetailFromUrl(url: string): Promise<ContentModel[]> {
    const html = await this.fetchHtml(url);
    return this.parseDetailPage(html);
  }

  private async fetchHtml(url: string): Promise<string> {
    const dispatcher = this.proxyUrl
      ? new ProxyAgent(this.proxyUrl) as any
      : undefined;

    const res = await this.fetchWithAbort(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9",
      },
      ...(dispatcher ? { dispatcher } : {}),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching ${url}`);
    }
    return await res.text();
  }

  private parseSearchResults(html: string, tag: string): ContentModel[] {
    const $ = cheerio.load(html);
    const contents: ContentModel[] = [];

    $(".s_post_list .s_post").each((_i, el) => {
      const titleEl = $(el).find(".p_title a");
      const title = titleEl.text().trim();
      const href = titleEl.attr("href") || "";
      const displayUrl = href.startsWith("http") ? href : `https://tieba.baidu.com${href}`;
      const desc = $(el).find(".p_content").text().trim();
      const authorName = $(el).find(".p_author").text().trim();
      const replyText = $(el).find(".p_reply").text().trim();
      const replyMatch = replyText.match(/\d+/);
      const commentCount = replyMatch ? parseInt(replyMatch[0], 10) : undefined;

      const threadMatch = href.match(/\/p\/(\d+)/);
      const contentId = threadMatch?.[1] || href;

      if (contentId) {
        contents.push({
          contentId,
          title,
          desc,
          displayUrl,
          authorName: authorName || undefined,
          commentCount,
          tag,
          rawJson: JSON.stringify({ html: $(el).html() }),
        });
      }
    });

    return contents;
  }

  private parseDetailPage(html: string): ContentModel[] {
    const $ = cheerio.load(html);
    const contents: ContentModel[] = [];

    const threadId = $("link[rel='canonical']")
      .attr("href")
      ?.match(/\/p\/(\d+)/)?.[1];

    const title = $("title").text().trim();
    const authorName = $(".d_author .p_author_name").first().text().trim() ||
      $(".core_title_tle").attr("data-title") || undefined;

    $(".l_post:not(.lzl_content)").each((_i, el) => {
      const postId = $(el).attr("id")?.replace(/^post_content_/, "") || threadId || "";
      const content = $(el).find(".d_post_content").text().trim();
      const replyCountText = $(".l_reply_num .red").first().text().trim();
      const replyCount = replyCountText ? parseInt(replyCountText, 10) : undefined;

      if (postId) {
        contents.push({
          contentId: postId,
          title,
          desc: content || undefined,
          displayUrl: threadId
            ? `https://tieba.baidu.com/p/${threadId}`
            : undefined,
          authorName,
          commentCount: replyCount,
        });
      }
    });

    if (contents.length === 0 && threadId) {
      contents.push({
        contentId: threadId,
        title,
        desc: $(".d_post_content_first").text().trim() || undefined,
        displayUrl: `https://tieba.baidu.com/p/${threadId}`,
        authorName,
      });
    }

    return contents;
  }
}
