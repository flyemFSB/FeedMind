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
import { logOperation } from "../../modules/ops-log/service.js";

export const crawlerRoutes = new Hono();

// ─── 任务 ───────────────────────────────────────────────────────
crawlerRoutes.post("/crawler/tasks", async (c) => {
  const payload = await parseJson(c, taskCreateSchema);
  const task = await createCrawlerTask(payload);
  void logOperation({ action: "create", target: "crawler_task", targetName: task.route });
  return jsonOk(c, task, 201);
});

// 列出微信读书书架中的公众号（供前端选择指定订阅）
crawlerRoutes.get("/crawler/weread/mps", async (c) => {
  const data = await listWereadMps();
  return jsonOk(c, data);
});

crawlerRoutes.get("/crawler/bili/favs", async (c) => {
  const data = await listBiliFavs();
  return jsonOk(c, data);
});

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
  return jsonOk(c, task);
});

crawlerRoutes.get("/crawler/tasks/:id/rss", async (c) => {
  const rssXml = await getTaskRss(c.req.param("id"));
  c.header("Content-Type", "application/rss+xml; charset=utf-8");
  return c.body(rssXml);
});

crawlerRoutes.post("/crawler/tasks/:id/cancel", async (c) => {
  const task = await cancelTask(c.req.param("id"));
  void logOperation({
    action: "run",
    target: "crawler_task",
    targetName: task.route,
    detail: "取消任务",
  });
  return jsonOk(c, task, 202);
});

crawlerRoutes.delete("/crawler/tasks/:id", async (c) => {
  const id = c.req.param("id");
  // 删除前先取路由名供日志展示（deleteTask 无返回值）
  const task = await getTask(id).catch(() => null);
  await deleteTask(id);
  void logOperation({
    action: "delete",
    target: "crawler_task",
    targetName: task?.route ?? id,
  });
  return c.body(null, 204);
});
