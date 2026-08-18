import { Hono } from "hono";
import { jsonOk } from "../../lib/http.js";
import { listOperations, type OpsAction, type OpsResult } from "../../modules/ops-log/service.js";

export const opsLogRoutes = new Hono();

// 操作日志列表（倒序，分页）
opsLogRoutes.get("/ops-log", async (c) => {
  const limit = Math.max(1, Math.min(200, Number(c.req.query("limit")) || 50));
  const offset = Math.max(0, Number(c.req.query("offset")) || 0);
  const action = c.req.query("action") as OpsAction | undefined;
  const target = c.req.query("target")?.trim();
  const result = c.req.query("result") as OpsResult | undefined;
  // 非法筛选值直接忽略（白名单外按无筛选处理）
  const validActions: OpsAction[] = ["create", "update", "delete", "import", "run"];
  const validResults: OpsResult[] = ["success", "failed"];
  return jsonOk(
    c,
    await listOperations(limit, offset, {
      ...(action && validActions.includes(action) ? { action } : {}),
      ...(target ? { target } : {}),
      ...(result && validResults.includes(result) ? { result } : {}),
    }),
  );
});
