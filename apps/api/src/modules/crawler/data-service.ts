import { and, count, desc, eq, sql } from "drizzle-orm";
import { crawlerContents, crawlerCreators } from "@feedmind/db";
import type {
  ContentListItem,
  ContentRead,
  CreatorListItem,
  CreatorRead,
  Platform,
} from "@feedmind/contracts";
import { db } from "@feedmind/db";
import { HttpError } from "../../lib/http.js";

// ─── 辅助函数 ─────────────────────────────────────────────────
function toContentRead(row: typeof crawlerContents.$inferSelect): ContentRead {
  return {
    id: row.id,
    platform: row.platform as Platform,
    content_id: row.contentId,
    title: row.title,
    desc: row.desc,
    display_url: row.displayUrl,
    images: row.images,
    video_url: row.videoUrl,
    video_cover_url: row.videoCoverUrl,
    author_id: row.authorId,
    author_name: row.authorName,
    author_avatar: row.authorAvatar,
    like_count: row.likeCount,
    collect_count: row.collectCount,
    comment_count: row.commentCount,
    share_count: row.shareCount,
    published_at: row.publishedAt,
    crawled_at: row.crawledAt,
    task_id: row.taskId,
    tag: row.tag,
  };
}

function toContentListItem(row: typeof crawlerContents.$inferSelect): ContentListItem {
  return {
    id: row.id,
    platform: row.platform as Platform,
    content_id: row.contentId,
    title: row.title,
    desc: row.desc,
    display_url: row.displayUrl,
    author_name: row.authorName,
    author_avatar: row.authorAvatar,
    like_count: row.likeCount,
    published_at: row.publishedAt,
    tag: row.tag,
  };
}

function toCreatorRead(row: typeof crawlerCreators.$inferSelect): CreatorRead {
  return {
    id: row.id,
    platform: row.platform as Platform,
    creator_id: row.creatorId,
    name: row.name,
    avatar: row.avatar,
    desc: row.desc,
    follower_count: row.followerCount,
    following_count: row.followingCount,
    note_count: row.noteCount,
    gender: row.gender,
    crawled_at: row.crawledAt,
    task_id: row.taskId,
  };
}

function toCreatorListItem(row: typeof crawlerCreators.$inferSelect): CreatorListItem {
  return {
    id: row.id,
    platform: row.platform as Platform,
    creator_id: row.creatorId,
    name: row.name,
    avatar: row.avatar,
    follower_count: row.followerCount,
    note_count: row.noteCount,
  };
}

// ─── 公开 API ──────────────────────────────────────────────────

export async function listContents(params: {
  platform?: string;
  keyword?: string;
  author_id?: string;
  task_id?: string;
  offset: number;
  limit: number;
  sort: string;
}): Promise<{ data: ContentListItem[]; total: number }> {
  const conditions = [];

  if (params.platform) {
    conditions.push(eq(crawlerContents.platform, params.platform));
  }
  if (params.keyword) {
    conditions.push(eq(crawlerContents.tag, params.keyword));
  }
  if (params.author_id) {
    conditions.push(eq(crawlerContents.authorId, params.author_id));
  }
  if (params.task_id) {
    conditions.push(eq(crawlerContents.taskId, params.task_id));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalResult, rows] = await Promise.all([
    db.select({ count: count() }).from(crawlerContents).where(where),
    db
      .select()
      .from(crawlerContents)
      .where(where)
      .orderBy(
        params.sort.startsWith("-")
          ? desc(crawlerContents.crawledAt)
          : sql`${crawlerContents.crawledAt} asc`,
      )
      .limit(params.limit)
      .offset(params.offset),
  ]);

  return {
    data: rows.map(toContentListItem),
    total: Number(totalResult[0]?.count ?? 0),
  };
}

export async function getContent(contentId: string): Promise<ContentRead> {
  const row = await db
    .select()
    .from(crawlerContents)
    .where(eq(crawlerContents.id, contentId))
    .get();

  if (!row) {
    throw new HttpError(404, "NOT_FOUND", `内容 ${contentId} 不存在`);
  }

  return toContentRead(row);
}

export async function listCreators(params: {
  platform?: string;
  offset: number;
  limit: number;
  sort: string;
}): Promise<{ data: CreatorListItem[]; total: number }> {
  const conditions = [];

  if (params.platform) {
    conditions.push(eq(crawlerCreators.platform, params.platform));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalResult, rows] = await Promise.all([
    db.select({ count: count() }).from(crawlerCreators).where(where),
    db
      .select()
      .from(crawlerCreators)
      .where(where)
      .orderBy(
        params.sort.startsWith("-")
          ? desc(crawlerCreators.crawledAt)
          : sql`${crawlerCreators.crawledAt} asc`,
      )
      .limit(params.limit)
      .offset(params.offset),
  ]);

  return {
    data: rows.map(toCreatorListItem),
    total: Number(totalResult[0]?.count ?? 0),
  };
}

export async function getCreator(creatorId: string): Promise<CreatorRead> {
  const row = await db
    .select()
    .from(crawlerCreators)
    .where(eq(crawlerCreators.id, creatorId))
    .get();

  if (!row) {
    throw new HttpError(404, "NOT_FOUND", `创作者 ${creatorId} 不存在`);
  }

  return toCreatorRead(row);
}
