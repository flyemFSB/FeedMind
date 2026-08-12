import { Hono } from "hono";
import { jsonOk, jsonError, parseJson } from "../../lib/http.js";
import {
  listFeeds,
  markRead,
  markAllRead,
  syncAll,
  deleteFeeds,
} from "../../modules/feeds/service.js";
import { feedDeleteSchema } from "@feedmind/contracts";
import { logger } from "../../lib/logger.js";

export const feedRoutes = new Hono();

feedRoutes.get("/feeds", async (c) => {
  const offset = Math.max(0, Number(c.req.query("offset")) || 0);
  // 上限 5000：前端虚拟化一次性拉全量（无分页 UI），上限过小会截掉 pubDate 较旧的来源条目
  const limit = Math.min(5000, Math.max(1, Number(c.req.query("limit")) || 50));
  const sourceId = c.req.query("source_id");

  const { data, total } = await listFeeds({
    offset,
    limit,
    ...(sourceId !== undefined ? { source_id: sourceId } : {}),
  });
  return jsonOk(c, {
    data,
    pagination: { offset, limit, total, has_more: offset + limit < total },
  });
});

feedRoutes.post("/feeds/:id/read", async (c) => {
  await markRead(c.req.param("id"));
  return jsonOk(c, { action: "done" });
});

feedRoutes.post("/feeds/read-all", async (c) => {
  const sourceId = c.req.query("source_id");
  if (!sourceId) return jsonError(c, 400, "MISSING_PARAM", "需要 source_id 参数");
  await markAllRead(sourceId);
  return jsonOk(c, { action: "done" });
});

feedRoutes.delete("/feeds", async (c) => {
  const { ids } = await parseJson(c, feedDeleteSchema);
  await deleteFeeds(ids);
  return c.body(null, 204);
});

feedRoutes.post("/feeds/sync", async (c) => {
  const result = await syncAll();
  logger.info({ result }, "同步完成");
  return jsonOk(c, result);
});
