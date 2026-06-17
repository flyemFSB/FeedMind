import { randomUUID } from "node:crypto";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { crawlerTasks } from "@feedmind/db";
import type { TaskCreate, TaskListItem, TaskRead, TaskStatus } from "@feedmind/contracts";
import { db } from "@feedmind/db";
import { getRouteHandler } from "@feedmind/crawler-core";
import type { RouteHandlerParams } from "@feedmind/crawler-core";
import { HttpError } from "../../lib/http.js";
import { DbStore } from "./db-store.js";
import { logger } from "../../lib/logger.js";
import { apiEnv } from "../../env.js";

// ─── 辅助函数 ───────────────────────────────────────────────────
function toTaskRead(row: typeof crawlerTasks.$inferSelect): TaskRead {
  const baseUrl = apiEnv.API_BASE_URL ?? "http://localhost:8000";
  return {
    id: row.id,
    route: row.route,
    params: row.params,
    cookies: row.cookies,
    proxy_url: row.proxyUrl,
    max_items: row.maxItems,
    status: row.status as TaskStatus,
    progress: row.progress,
    error: row.error,
    rss_url: row.rssOutput ? `${baseUrl}/api/v1/crawler/tasks/${row.id}/rss` : null,
    started_at: row.startedAt,
    finished_at: row.finishedAt,
    created_at: row.createdAt,
  };
}

function toTaskListItem(row: typeof crawlerTasks.$inferSelect): TaskListItem {
  return {
    id: row.id,
    route: row.route,
    status: row.status as TaskStatus,
    progress: row.progress,
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
  // 检查路由是否存在
  const handler = getRouteHandler(input.route);
  if (!handler) {
    throw new HttpError(400, "INVALID_ROUTE", `未知路由: ${input.route}`);
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  const paramsStr = JSON.stringify(input.params);

  const rowValues = {
    id,
    route: input.route,
    params: paramsStr,
    cookies: input.cookies ?? null,
    proxyUrl: input.proxy_url ?? null,
    maxItems: input.max_items,
    status: "queued" as const,
    progress: null,
    error: null,
    rssOutput: null,
    startedAt: null,
    finishedAt: null,
    createdAt: now,
  };

  await db.transaction(async (tx) => {
    const running = await tx
      .select({ count: count() })
      .from(crawlerTasks)
      .where(and(eq(crawlerTasks.route, input.route), eq(crawlerTasks.status, "running")));

    if (Number(running[0]?.count ?? 0) > 0) {
      throw new HttpError(409, "CONFLICT", `路由 ${input.route} 已有任务正在运行`);
    }

    await tx.insert(crawlerTasks).values(rowValues);
  });

  // 后台执行（不阻塞响应）
  runCrawlerTask(id, input).catch(() => {});

  return toTaskRead(rowValues);
}

async function runCrawlerTask(taskId: string, input: TaskCreate): Promise<void> {
  const controller = new AbortController();
  runningTasks.set(taskId, controller);

  try {
    const handler = getRouteHandler(input.route);
    if (!handler) {
      throw new Error(`路由 ${input.route} 不存在`);
    }

    const store = new DbStore();

    const params: RouteHandlerParams = {
      params: input.params,
      cookies: input.cookies,
      abortSignal: controller.signal,
      maxItems: input.max_items,
    };

    await store.updateTaskStatus(taskId, "running");
    const result = await handler(params);
    await store.updateTaskRss(taskId, result.rssXml);
    await store.updateTaskStatus(taskId, "completed");
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
  route?: string;
  status?: string;
  offset: number;
  limit: number;
  sort: string;
}): Promise<{ data: TaskListItem[]; total: number }> {
  const conditions = [];

  if (params.route) conditions.push(eq(crawlerTasks.route, params.route));
  if (params.status) conditions.push(eq(crawlerTasks.status, params.status));

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

  return {
    data: rows.map(toTaskListItem),
    total: Number(totalResult[0]?.count ?? 0),
  };
}

export async function getTask(taskId: string): Promise<TaskRead> {
  const row = await db.select().from(crawlerTasks).where(eq(crawlerTasks.id, taskId)).get();
  if (!row) throw new HttpError(404, "NOT_FOUND", `任务 ${taskId} 不存在`);
  return toTaskRead(row);
}

export async function getTaskRss(taskId: string): Promise<string> {
  const row = await db
    .select({ rssOutput: crawlerTasks.rssOutput, status: crawlerTasks.status })
    .from(crawlerTasks)
    .where(eq(crawlerTasks.id, taskId))
    .get();

  if (!row) throw new HttpError(404, "NOT_FOUND", `任务 ${taskId} 不存在`);
  if (!row.rssOutput)
    throw new HttpError(
      404,
      "NOT_FOUND",
      `任务 ${taskId} 尚未生成 RSS 输出（状态: ${row.status}）`,
    );

  return row.rssOutput;
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
