import { Hono } from "hono";
import { jsonOk } from "../../lib/http.js";
import { listOperations } from "../../modules/ops-log/service.js";

export const opsLogRoutes = new Hono();

// 操作日志列表（倒序，分页）
opsLogRoutes.get("/ops-log", async (c) => {
  const limit = Math.max(1, Math.min(200, Number(c.req.query("limit")) || 50));
  const offset = Math.max(0, Number(c.req.query("offset")) || 0);
  return jsonOk(c, await listOperations(limit, offset));
});
