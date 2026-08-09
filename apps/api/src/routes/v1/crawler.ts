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
  listWereadMps,
  listBiliFavs,
  listZhCollections,
} from "../../modules/crawler/service.js";

export const crawlerRoutes = new Hono();

// ─── 任务 ───────────────────────────────────────────────────────
crawlerRoutes.post("/crawler/tasks", async (c) => {
  const payload = await parseJson(c, taskCreateSchema);
  return jsonOk(c, { data: await createCrawlerTask(payload) }, 201);
});

// 列出微信读书书架中的公众号（供前端选择指定订阅）
crawlerRoutes.get("/crawler/weread/mps", async (c) => {
  const data = await listWereadMps();
  return jsonOk(c, data);
});

// 列出 B站当前登录用户的收藏夹
crawlerRoutes.get("/crawler/bili/favs", async (c) => {
  const data = await listBiliFavs();
  return jsonOk(c, data);
});

// 列出知乎当前登录用户的收藏夹
crawlerRoutes.get("/crawler/zh/collections", async (c) => {
  const data = await listZhCollections();
  return jsonOk(c, data);
});

crawlerRoutes.get("/crawler/tasks", async (c) => {
  const offset = Math.max(0, Number(c.req.query("offset")) || 0);
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit")) || 20));
  const sort = c.req.query("sort") ?? "-created_at";

  const route = c.req.query("route");
  const status = c.req.query("status");

  const { data, total } = await listTasks({
    offset,
    limit,
    sort,
    ...(route !== undefined ? { route } : {}),
    ...(status !== undefined ? { status } : {}),
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
