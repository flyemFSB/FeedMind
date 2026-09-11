import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { getHealth } from "../../modules/health/service.js";
import { successEnvelope } from "../../lib/openapi-schemas.js";

export const healthRoutes = new OpenAPIHono();

const healthDataSchema = z.object({
  status: z.enum(["ok", "degraded"]).describe("服务状态"),
  database: z.boolean().describe("数据库连接是否正常"),
});

const healthRoute = createRoute({
  method: "get",
  path: "/health",
  responses: {
    200: {
      content: { "application/json": { schema: successEnvelope(healthDataSchema) } },
      description: "健康检查 — 返回服务及数据库状态",
    },
    500: {
      content: {
        "application/json": {
          schema: z.object({
            data: z.null(),
            error: z.object({ code: z.string(), message: z.string() }),
          }),
        },
      },
      description: "服务器内部错误",
    },
  },
});

healthRoutes.openapi(healthRoute, async (c) => {
  try {
    return c.json({ data: await getHealth(), error: null }, 200);
  } catch {
    return c.json({ data: null, error: { code: "INTERNAL_ERROR", message: "健康检查失败" } }, 500);
  }
});
