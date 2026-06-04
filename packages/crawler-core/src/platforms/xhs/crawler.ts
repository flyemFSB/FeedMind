import crypto from "node:crypto";
import { AbstractCrawler, type CrawlerStore } from "../../core/abstract-crawler.js";
import type { CrawlerContext, ContentModel, CreatorModel, StoreResult } from "../../core/types.js";

/**
 * 小红书爬虫
 *
 * 通过 edith.xiaohongshu.com API 获取数据，需要 X-S/X-T 签名验证。
 *
 * ── 签名算法 ──
 * X-T = 13 位毫秒时间戳
 * X-S = MD5(path + "&" + body + "&" + X-T + "&" + salt)，body 为序列化 JSON
 */
const XHS_SALT = "i+X,MqLqFLwG";
const BASE_URL = "https://edith.xiaohongshu.com";
const COMMON_HEADERS: Record<string, string> = {
  Origin: "https://www.xiaohongshu.com",
  Referer: "https://www.xiaohongshu.com/explore",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Content-Type": "application/json;charset=UTF-8",
};

function generateSignature(path: string, body: string, xt: string): string {
  const signStr = `${path}&${body}&${xt}&${XHS_SALT}`;
  const md5 = crypto.createHash("md5").update(signStr, "utf-8").digest("hex");
  return `x_x_${md5}`;
}

function buildHeaders(path: string, body: string): Record<string, string> {
  const xt = Date.now().toString();
  const xs = generateSignature(path, body, xt);
  return {
    ...COMMON_HEADERS,
    "X-S": xs,
    "X-T": xt,
  };
}

interface XhsNote {
  note_id: string;
  type: string;
  display_title?: string;
  desc?: string;
  image_list?: { url: string; width: number; height: number }[];
  video?: { media?: { stream?: { master_url?: string } }; cover?: { url: string } };
  user?: { user_id: string; nickname: string; avatar_url?: string };
  interact_info?: {
    liked_count?: string;
    collected_count?: string;
    comment_count?: string;
    share_count?: string;
  };
  time?: number;
  tag_list?: { name: string }[];
}

export class XhsCrawler extends AbstractCrawler {
  protected async execute(
    ctx: CrawlerContext,
    store: CrawlerStore,
  ): Promise<StoreResult> {
    const allContents: ContentModel[] = [];
    const allCreators: CreatorModel[] = [];

    if (ctx.crawlerType === "search" && ctx.keywords?.length) {
      for (const keyword of ctx.keywords) {
        if (this.abortSignal?.aborted) break;
        const notes = await this.searchNotes(keyword, ctx.maxNotes);
        allContents.push(...notes);
      }
    } else if (ctx.crawlerType === "detail" && ctx.specifiedUrls?.length) {
      for (const url of ctx.specifiedUrls) {
        if (this.abortSignal?.aborted) break;
        const noteId = this.extractNoteId(url);
        if (noteId) {
          const note = await this.getNoteDetail(noteId);
          if (note) allContents.push(note);
        }
      }
    } else if (ctx.crawlerType === "creator" && ctx.creatorIds?.length) {
      for (const creatorId of ctx.creatorIds) {
        if (this.abortSignal?.aborted) break;
        const notes = await this.getCreatorNotes(creatorId, ctx.maxNotes);
        allContents.push(...notes);

        const creator = await this.getCreatorInfo(creatorId);
        if (creator) allCreators.push(creator);
      }
    }

    const inserted = await store.saveContents(ctx.taskId, ctx.platform, allContents);
    const insertedCreators = await store.saveCreators(ctx.taskId, ctx.platform, allCreators);

    return { insertedContents: inserted, insertedCreators };
  }

  private extractNoteId(url: string): string | null {
    const patterns = [
      /xiaohongshu\.com\/explore\/([a-f0-9]+)/,
      /xiaohongshu\.com\/discovery\/item\/([a-f0-9]+)/,
      /note\/([a-f0-9]+)/,
    ];
    for (const p of patterns) {
      const m = url.match(p);
      if (m?.[1]) return m[1];
    }
    return null;
  }

  private async searchNotes(keyword: string, maxNotes: number): Promise<ContentModel[]> {
    const path = "/api/sns/web/v1/search/notes";
    const body = JSON.stringify({
      keyword,
      page: 1,
      page_size: Math.min(maxNotes, 20),
      sort: "general",
      note_type: 0,
    });

    const res = await this.fetchApi<{ data?: { items?: { id: string; model_type: string; note_card?: XhsNote }[] } }>(
      path, body,
    );

    return (res.data?.items ?? [])
      .filter((item) => item.note_card)
      .map((item) => this.toContentModel(item.note_card!, keyword));
  }

  private async getNoteDetail(noteId: string): Promise<ContentModel | null> {
    const path = "/api/sns/web/v1/feed";
    const body = JSON.stringify({
      source_note_id: noteId,
      image_formats: ["jpg", "webp", "avif"],
      extra: { need_body_topic: 1 },
    });

    const res = await this.fetchApi<{
      data?: { items?: { note_card?: XhsNote }[] };
    }>(path, body);

    return res.data?.items?.[0]?.note_card
      ? this.toContentModel(res.data.items[0].note_card)
      : null;
  }

  private async getCreatorNotes(creatorId: string, maxNotes: number): Promise<ContentModel[]> {
    const path = "/api/sns/web/v1/user/note";
    const body = JSON.stringify({
      user_id: creatorId,
      cursor: "",
      num: Math.min(maxNotes, 20),
      image_formats: ["jpg", "webp", "avif"],
    });

    const res = await this.fetchApi<{
      data?: { items?: { note_card?: XhsNote }[] };
    }>(path, body);

    return (res.data?.items ?? [])
      .filter((i) => i.note_card)
      .map((i) => this.toContentModel(i.note_card!));
  }

  private async getCreatorInfo(creatorId: string): Promise<CreatorModel | null> {
    const path = "/api/sns/web/v1/user/otherinfo";
    const body = JSON.stringify({ target_user_id: creatorId });

    const res = await this.fetchApi<{
      data?: {
        user_info?: {
          user_id: string;
          nickname: string;
          avatar_url?: string;
          desc?: string;
          gender?: number;
        };
        follower_count?: number;
        following_count?: number;
        note_count?: number;
      };
    }>(path, body);

    const data = res.data;
    const info = data?.user_info;
    if (!info) return null;

    return {
      creatorId: info.user_id,
      name: info.nickname,
      avatar: info.avatar_url,
      desc: info.desc,
      followerCount: data?.follower_count,
      followingCount: data?.following_count,
      noteCount: data?.note_count,
      gender: info.gender === 1 ? "male" : info.gender === 2 ? "female" : undefined,
    };
  }

  private toContentModel(note: XhsNote, tag?: string): ContentModel {
    const images = note.image_list?.map((img) => ({
      url: img.url,
      width: img.width,
      height: img.height,
    }));
    const videoUrl = note.video?.media?.stream?.master_url;
    const videoCover = note.video?.cover?.url;

    return {
      contentId: note.note_id,
      title: note.display_title,
      desc: note.desc,
      displayUrl: `https://www.xiaohongshu.com/explore/${note.note_id}`,
      images,
      videoUrl,
      videoCoverUrl: videoCover,
      authorId: note.user?.user_id,
      authorName: note.user?.nickname,
      authorAvatar: note.user?.avatar_url,
      // 使用 != null 而非 truthiness，避免 "0" 字符串被 falsy 处理
      likeCount: note.interact_info?.liked_count != null ? parseInt(note.interact_info.liked_count, 10) : undefined,
      collectCount: note.interact_info?.collected_count != null ? parseInt(note.interact_info.collected_count, 10) : undefined,
      commentCount: note.interact_info?.comment_count != null ? parseInt(note.interact_info.comment_count, 10) : undefined,
      shareCount: note.interact_info?.share_count != null ? parseInt(note.interact_info.share_count, 10) : undefined,
      publishedAt: note.time ? new Date(note.time * 1000).toISOString() : undefined,
      tag,
      rawJson: JSON.stringify(note),
    };
  }

  private async fetchApi<T>(path: string, body: string): Promise<T> {
    const headers = buildHeaders(path, body);
    if (this.cookies) headers.Cookie = this.cookies;

    const res = await this.fetchWithAbort(`${BASE_URL}${path}`, {
      method: "POST",
      headers,
      body,
    });

    if (!res.ok) {
      throw new Error(`XHS API ${res.status}: ${res.statusText}`);
    }

    return res.json() as Promise<T>;
  }
}
