import { randomUUID } from "node:crypto";
import { and, count, desc, eq, like, sql } from "drizzle-orm";
import { crawlerTasks } from "@feedmind/db";
import type {
  TaskCreate,
  TaskListItem,
  TaskRead,
  Platform,
  CrawlerType,
  TaskStatus,
} from "@feedmind/contracts";
import { db } from "@feedmind/db";
import { HttpError } from "../../lib/http.js";
import { createCrawler } from "@feedmind/crawler-core";
import type { CrawlerContext } from "@feedmind/crawler-core";
import { DbStore } from "./db-store.js";
import { logger } from "../../lib/logger.js";

// ─── 辅助函数 ───────────────────────────────────────────────────
function toTaskRead(row: typeof crawlerTasks.$inferSelect): TaskRead {
  return {
    id: row.id,
    platform: row.platform as Platform,
    crawler_type: row.crawlerType as CrawlerType,
    keywords: row.keywords,
    specified_urls: row.specifiedUrls,
    creator_ids: row.creatorIds,
    cookies: row.cookies,
    proxy_url: row.proxyUrl,
    max_notes: row.maxNotes,
    max_concurrency: row.maxConcurrency,
    enable_media: row.enableMedia,
    status: row.status as TaskStatus,
    progress: row.progress,
    total: row.total,
    error: row.error,
    started_at: row.startedAt,
    finished_at: row.finishedAt,
    created_at: row.createdAt,
  };
}

function toTaskListItem(row: typeof crawlerTasks.$inferSelect): TaskListItem {
  return {
    id: row.id,
    platform: row.platform as Platform,
    crawler_type: row.crawlerType as CrawlerType,
    keywords: row.keywords,
    status: row.status as TaskStatus,
    progress: row.progress,
    total: row.total,
    error: row.error,
    started_at: row.startedAt,
    finished_at: row.finishedAt,
    created_at: row.createdAt,
  };
}

// ─── 跟踪运行中的任务，支持取消 ─────────────────────
const runningTasks = new Map<string, AbortController>();

// ─── 公开 API ────────────────────────────────────────────────

export async function createCrawlerTask(input: TaskCreate): Promise<TaskRead> {
  const id = randomUUID();

  const keywords = input.keywords?.length ? JSON.stringify(input.keywords) : null;
  const specifiedUrls = input.specified_urls?.length ? JSON.stringify(input.specified_urls) : null;
  const creatorIds = input.creator_ids?.length ? JSON.stringify(input.creator_ids) : null;

  if (input.crawler_type === "search" && !keywords) {
    throw new HttpError(422, "VALIDATION_ERROR", "search 模式需要提供 keywords");
  }
  if (input.crawler_type === "detail" && !specifiedUrls) {
    throw new HttpError(422, "VALIDATION_ERROR", "detail 模式需要提供 specified_urls");
  }
  if (input.crawler_type === "creator" && !creatorIds) {
    throw new HttpError(422, "VALIDATION_ERROR", "creator 模式需要提供 creator_ids");
  }

  // 在事务中检查+插入，防止竞态
  const now = new Date().toISOString();
  const rowValues = {
    id,
    platform: input.platform,
    crawlerType: input.crawler_type,
    keywords,
    specifiedUrls,
    creatorIds,
    cookies: input.cookies ?? null,
    proxyUrl: input.proxy_url ?? null,
    maxNotes: input.max_notes,
    maxConcurrency: input.max_concurrency,
    enableMedia: input.enable_media ? 1 : 0,
    status: "queued" as const,
    progress: 0,
    total: 0,
    error: null,
    startedAt: null,
    finishedAt: null,
    createdAt: now,
  };

  // 事务确保同平台不会同时插入两个任务
  await db.transaction(async (tx) => {
    const running = await tx
      .select({ count: count() })
      .from(crawlerTasks)
      .where(and(eq(crawlerTasks.platform, input.platform), eq(crawlerTasks.status, "running")));

    if (Number(running[0]?.count ?? 0) > 0) {
      throw new HttpError(409, "CONFLICT", `平台 ${input.platform} 已有任务正在运行`);
    }

    await tx.insert(crawlerTasks).values(rowValues);
  });

  // 后台启动爬虫（不阻塞响应）
  runCrawlerTask(id, input).catch(() => {
    // 错误在 runCrawlerTask 内部已处理
  });

  return toTaskRead(rowValues);
}

async function runCrawlerTask(taskId: string, input: TaskCreate): Promise<void> {
  const controller = new AbortController();
  runningTasks.set(taskId, controller);

  try {
    const store = new DbStore();
    const crawler = createCrawler(
      input.platform,
      input.cookies,
      input.proxy_url,
      controller.signal,
    );

    const ctx: CrawlerContext = {
      taskId,
      platform: input.platform,
      crawlerType: input.crawler_type,
      keywords: input.keywords,
      specifiedUrls: input.specified_urls,
      creatorIds: input.creator_ids,
      cookies: input.cookies,
      proxyUrl: input.proxy_url,
      maxNotes: input.max_notes,
      maxConcurrency: input.max_concurrency,
      enableMedia: input.enable_media,
      abortSignal: controller.signal,
    };

    await crawler.start(ctx, store);
    await crawler.cleanup();
  } catch (err) {
    logger.error({ err, taskId }, "爬虫任务执行失败");
    try {
      await db
        .update(crawlerTasks)
        .set({
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
          finishedAt: sql`(current_timestamp)`,
        })
        .where(eq(crawlerTasks.id, taskId));
    } catch {
      // DB 写入失败说明系统可能有严重问题，不再重试
    }
  } finally {
    runningTasks.delete(taskId);
  }
}

export async function listTasks(params: {
  platform?: string;
  status?: string;
  crawler_type?: string;
  keyword?: string;
  offset: number;
  limit: number;
  sort: string;
}): Promise<{ data: TaskListItem[]; total: number }> {
  const conditions = [];

  if (params.platform) conditions.push(eq(crawlerTasks.platform, params.platform));
  if (params.status) conditions.push(eq(crawlerTasks.status, params.status));
  if (params.crawler_type) conditions.push(eq(crawlerTasks.crawlerType, params.crawler_type));
  if (params.keyword) conditions.push(like(crawlerTasks.keywords, `%${params.keyword}%`));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalResult, rows] = await Promise.all([
    db.select({ count: count() }).from(crawlerTasks).where(where),
    db
      .select()
      .from(crawlerTasks)
      .where(where)
      .orderBy(
        params.sort.startsWith("-")
          ? desc(crawlerTasks.createdAt)
          : sql`${crawlerTasks.createdAt} asc`,
      )
      .limit(params.limit)
      .offset(params.offset),
  ]);

  const total = Number(totalResult[0]?.count ?? 0);
  return { data: rows.map(toTaskListItem), total };
}

export async function getTask(taskId: string): Promise<TaskRead> {
  const row = await db.select().from(crawlerTasks).where(eq(crawlerTasks.id, taskId)).get();

  if (!row) throw new HttpError(404, "NOT_FOUND", `任务 ${taskId} 不存在`);

  return toTaskRead(row);
}

export async function cancelTask(taskId: string): Promise<TaskRead> {
  const row = await db.select().from(crawlerTasks).where(eq(crawlerTasks.id, taskId)).get();

  if (!row) throw new HttpError(404, "NOT_FOUND", `任务 ${taskId} 不存在`);

  if (row.status !== "running" && row.status !== "queued") {
    throw new HttpError(409, "CONFLICT", `任务状态为 ${row.status}，无法取消`);
  }

  const controller = runningTasks.get(taskId);
  if (controller) controller.abort();

  await db
    .update(crawlerTasks)
    .set({ status: "cancelled", finishedAt: sql`(current_timestamp)` })
    .where(eq(crawlerTasks.id, taskId));

  return toTaskRead({ ...row, status: "cancelled" as const });
}

export async function deleteTask(taskId: string): Promise<void> {
  const row = await db.select().from(crawlerTasks).where(eq(crawlerTasks.id, taskId)).get();

  if (!row) throw new HttpError(404, "NOT_FOUND", `任务 ${taskId} 不存在`);

  const controller = runningTasks.get(taskId);
  if (controller) controller.abort();

  await db.delete(crawlerTasks).where(eq(crawlerTasks.id, taskId));
}
