import { randomUUID } from "node:crypto";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { crawlerTasks, db, cookieStore } from "@feedmind/db";
import type { TaskCreate, TaskListItem, TaskRead, TaskStatus } from "@feedmind/contracts";
import { getRouteHandler } from "@feedmind/crawler-core";
import type { RouteHandlerParams } from "@feedmind/crawler-core";
import { HttpError } from "../../lib/http.js";
import { DbStore } from "./db-store.js";
import { logger } from "../../lib/logger.js";
import { apiEnv } from "../../env.js";

const ROUTE_TO_PLATFORM: Record<string, string> = {
  bili: "bilibili",
  dy: "douyin",
  xhs: "xiaohongshu",
  zh: "zhihu",
  weread: "weread",
};

// ─── 辅助函数 ───────────────────────────────────────────────────
function toTaskRead(row: typeof crawlerTasks.$inferSelect): TaskRead {
  const baseUrl = apiEnv.API_BASE_URL ?? "http://localhost:18790";
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

/** 通用：调路由并解析 RSS item（title=名称，description=id），返回选项列表 */
async function listRouteOptions(
  route: string,
  platform: string,
): Promise<{ name: string; id: string }[]> {
  const rows = await db
    .select({ cookies: cookieStore.cookies })
    .from(cookieStore)
    .where(eq(cookieStore.platform, platform));
  const cookies = rows.map((r) => r.cookies).join("; ") || undefined;

  const handler = getRouteHandler(route);
  if (!handler) throw new HttpError(500, "ROUTE_MISSING", `${route} 路由不存在`);

  try {
    const result = await handler({
      params: {},
      cookies,
      abortSignal: new AbortController().signal,
      maxItems: 100,
    });

    const items = [...result.rssXml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((m) => {
      const block = m[1];
      const name =
        block.match(/<title>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/title>/i)?.[1] ?? "";
      const id =
        block.match(
          /<description>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/description>/i,
        )?.[1] ?? "";
      return { name: name.trim(), id: id.trim() };
    });

    return items;
  } catch {
    // 抓取失败（网络波动/风控/登录失效），降级返回空列表，避免 500
    return [];
  }
}

/** 微信读书书架公众号列表 */
export const listWereadMps = (): Promise<{ name: string; id: string }[]> =>
  listRouteOptions("weread/mps", "weread");
/** B站当前登录用户收藏夹列表 */
export const listBiliFavs = (): Promise<{ name: string; id: string }[]> =>
  listRouteOptions("bili/favs", "bilibili");
/** 知乎当前登录用户收藏夹列表 */
export const listZhCollections = (): Promise<{ name: string; id: string }[]> =>
  listRouteOptions("zh/collections", "zhihu");

export async function createCrawlerTask(input: TaskCreate): Promise<TaskRead> {
  const handler = getRouteHandler(input.route);
  if (!handler) {
    throw new HttpError(400, "INVALID_ROUTE", `未知路由: ${input.route}`);
  }

  const id = randomUUID();
  const now = new Date().toISOString();

  // 从 cookie_store 自动获取 cookie
  const prefix = input.route.split("/")[0];
  const platform = ROUTE_TO_PLATFORM[prefix];
  const cookies = platform
    ? (await db.select().from(cookieStore).where(eq(cookieStore.platform, platform)).all())
        .map((r) => r.cookies)
        .join("; ")
    : null;

  const paramsStr = JSON.stringify(input.params);
  const rowValues = {
    id,
    route: input.route,
    params: paramsStr,
    cookies,
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

  // 任务启动失败（进入 try 块前的异常）不应被静默吞掉
  runCrawlerTask(id, input, cookies).catch((err) => {
    logger.warn({ err, taskId: id }, "爬虫任务启动失败");
  });
  logger.info({ taskId: id, route: input.route, maxItems: input.max_items }, "爬虫任务已创建");

  return toTaskRead(rowValues);
}

async function runCrawlerTask(
  taskId: string,
  input: TaskCreate,
  cookies: string | null,
): Promise<void> {
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
      cookies: cookies ?? undefined,
      abortSignal: controller.signal,
      maxItems: input.max_items,
    };

    await store.updateTaskStatus(taskId, "running");
    const result = await handler(params);
    await store.updateTaskRss(taskId, result.rssXml);
    await store.updateTaskStatus(taskId, "completed");
    logger.info({ taskId, route: input.route }, "爬虫任务完成");
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
