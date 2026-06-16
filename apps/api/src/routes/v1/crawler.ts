import { Hono } from "hono";
import { taskCreateSchema } from "@feedmind/contracts";
import { jsonOk, parseJson } from "../../lib/http.js";
import {
  createCrawlerTask,
  listTasks,
  getTask,
  getTaskRss,
  cancelTask,
  deleteTask,
} from "../../modules/crawler/service.js";

export const crawlerRoutes = new Hono();

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
    route: c.req.query("route"),
    status: c.req.query("status"),
    offset,
    limit,
    sort,
  });

  const pagination = {
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

crawlerRoutes.get("/crawler/tasks/:id/rss", async (c) => {
  const rssXml = await getTaskRss(c.req.param("id"));
  c.header("Content-Type", "application/rss+xml; charset=utf-8");
  return c.body(rssXml);
});

crawlerRoutes.post("/crawler/tasks/:id/cancel", async (c) => {
  const task = await cancelTask(c.req.param("id"));
  return jsonOk(c, { data: task }, 202);
});

crawlerRoutes.delete("/crawler/tasks/:id", async (c) => {
  await deleteTask(c.req.param("id"));
  return c.body(null, 204);
});
