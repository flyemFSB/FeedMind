import { db } from "@feedmind/db";
import { crawlerContents, crawlerCreators, crawlerTasks } from "@feedmind/db";
import { eq, sql } from "drizzle-orm";
import type { CrawlerStore } from "../core/abstract-crawler.js";
import type { ContentModel, CreatorModel } from "../core/types.js";

export class DbStore implements CrawlerStore {
  async saveContents(
    taskId: string,
    platform: string,
    contents: ContentModel[],
  ): Promise<number> {
    if (contents.length === 0) return 0;

    const values = contents.map((c) => ({
      platform,
      contentId: c.contentId,
      title: c.title,
      desc: c.desc,
      displayUrl: c.displayUrl,
      images: c.images ? JSON.stringify(c.images) : undefined,
      videoUrl: c.videoUrl,
      videoCoverUrl: c.videoCoverUrl,
      authorId: c.authorId,
      authorName: c.authorName,
      authorAvatar: c.authorAvatar,
      likeCount: c.likeCount,
      collectCount: c.collectCount,
      commentCount: c.commentCount,
      shareCount: c.shareCount,
      publishedAt: c.publishedAt,
      taskId,
      rawJson: c.rawJson,
      tag: c.tag,
    }));

    const result = await db
      .insert(crawlerContents)
      .values(values)
      .onConflictDoNothing({
        target: [crawlerContents.contentId, crawlerContents.platform],
      });

    return result.rowsAffected ?? 0;
  }

  async saveCreators(
    taskId: string,
    platform: string,
    creators: CreatorModel[],
  ): Promise<number> {
    if (creators.length === 0) return 0;

    const values = creators.map((c) => ({
      platform,
      creatorId: c.creatorId,
      name: c.name,
      avatar: c.avatar,
      desc: c.desc,
      followerCount: c.followerCount,
      followingCount: c.followingCount,
      noteCount: c.noteCount,
      gender: c.gender,
      taskId,
      rawJson: c.rawJson,
    }));

    const result = await db
      .insert(crawlerCreators)
      .values(values)
      .onConflictDoNothing({
        target: [crawlerCreators.creatorId, crawlerCreators.platform],
      });

    return result.rowsAffected ?? 0;
  }

  async updateTaskProgress(
    taskId: string,
    progress: number,
    total: number,
  ): Promise<void> {
    await db
      .update(crawlerTasks)
      .set({ progress, total })
      .where(eq(crawlerTasks.id, taskId));
  }

  async updateTaskStatus(
    taskId: string,
    status: string,
    error?: string,
  ): Promise<void> {
    const updates: Record<string, unknown> = { status };
    if (error) updates.error = error;
    if (status === "running") updates.startedAt = sql`(current_timestamp)`;
    if (status === "completed" || status === "failed" || status === "cancelled") {
      updates.finishedAt = sql`(current_timestamp)`;
    }
    await db
      .update(crawlerTasks)
      .set(updates)
      .where(eq(crawlerTasks.id, taskId));
  }
}
