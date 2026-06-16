import { Hono } from "hono";
import { PLATFORMS, taskCreateSchema } from "@feedmind/contracts";
import { jsonOk, parseJson } from "../../lib/http.js";
import {
  createCrawlerTask,
  listTasks,
  getTask,
  cancelTask,
  deleteTask,
} from "../../modules/crawler/service.js";
import {
  listContents,
  getContent,
  listCreators,
  getCreator,
} from "../../modules/crawler/data-service.js";
import type { Pagination } from "@feedmind/contracts";

export const crawlerRoutes = new Hono();

// ─── 平台 ───────────────────────────────────────────────────────
crawlerRoutes.get("/crawler/platforms", async (c) => jsonOk(c, { data: PLATFORMS }));

// ─── 任务 ───────────────────────────────────────────────────────
crawlerRoutes.post("/crawler/tasks", async (c) => {
  const payload = await parseJson(c, taskCreateSchema);
  return jsonOk(c, { data: await createCrawlerTask(payload) }, 201);
});

crawlerRoutes.get("/crawler/tasks", async (c) => {
  const offset = Math.max(0, Number(c.req.query("offset")) || 0);
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit")) || 20));
  const sort = c.req.query("sort") ?? "-created_at";

  const { data, total } = await listTasks({
    platform: c.req.query("platform"),
    status: c.req.query("status"),
    crawler_type: c.req.query("crawler_type"),
    keyword: c.req.query("keyword"),
    offset,
    limit,
    sort,
  });

  const pagination: Pagination = {
    offset,
    limit,
    total,
    has_more: offset + limit < total,
  };

  return jsonOk(c, { data, pagination });
});

crawlerRoutes.get("/crawler/tasks/:id", async (c) => {
  const task = await getTask(c.req.param("id"));
  return jsonOk(c, { data: task });
});

crawlerRoutes.post("/crawler/tasks/:id/cancel", async (c) => {
  const task = await cancelTask(c.req.param("id"));
  return jsonOk(c, { data: task }, 202);
});

crawlerRoutes.delete("/crawler/tasks/:id", async (c) => {
  await deleteTask(c.req.param("id"));
  return c.body(null, 204);
});

// ─── 内容 ───────────────────────────────────────────────────────
crawlerRoutes.get("/crawler/contents", async (c) => {
  const offset = Math.max(0, Number(c.req.query("offset")) || 0);
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit")) || 20));
  const sort = c.req.query("sort") ?? "-crawled_at";

  const { data, total } = await listContents({
    platform: c.req.query("platform"),
    keyword: c.req.query("keyword"),
    author_id: c.req.query("author_id"),
    task_id: c.req.query("task_id"),
    offset,
    limit,
    sort,
  });

  const pagination: Pagination = {
    offset,
    limit,
    total,
    has_more: offset + limit < total,
  };

  return jsonOk(c, { data, pagination });
});

crawlerRoutes.get("/crawler/contents/:id", async (c) => {
  const content = await getContent(c.req.param("id"));
  return jsonOk(c, { data: content });
});

// ─── 创作者 ─────────────────────────────────────────────────────
crawlerRoutes.get("/crawler/creators", async (c) => {
  const offset = Math.max(0, Number(c.req.query("offset")) || 0);
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit")) || 20));
  const sort = c.req.query("sort") ?? "-crawled_at";

  const { data, total } = await listCreators({
    platform: c.req.query("platform"),
    offset,
    limit,
    sort,
  });

  const pagination: Pagination = {
    offset,
    limit,
    total,
    has_more: offset + limit < total,
  };

  return jsonOk(c, { data, pagination });
});

crawlerRoutes.get("/crawler/creators/:id", async (c) => {
  const creator = await getCreator(c.req.param("id"));
  return jsonOk(c, { data: creator });
});
