import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { apiReference } from "@scalar/hono-api-reference";
import { apiEnv } from "../env.js";
import { getHealth } from "../modules/health/service.js";

// ─── Schemas ─────────────────────────────────────────────────

const healthDataSchema = z.object({
  status: z.enum(["ok", "degraded"]).describe("服务状态"),
  database: z.boolean().describe("数据库连接是否正常"),
});

// ─── Route Definitions ────────────────────────────────────────

const healthRoute = createRoute({
  method: "get",
  path: "/health",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            data: healthDataSchema,
            error: z.null(),
          }),
        },
      },
      description: "健康检查 — 返回服务及数据库状态",
    },
    500: {
      content: {
        "application/json": {
          schema: z.object({
            data: z.null(),
            error: z.object({
              code: z.string(),
              message: z.string(),
            }),
          }),
        },
      },
      description: "服务器内部错误",
    },
  },
});

// ─── OpenAPI App ──────────────────────────────────────────────

export const openapiApp = new OpenAPIHono();

// 注册已文档化的路由
openapiApp.openapi(healthRoute, async (c) => {
  try {
    const result = await getHealth();
    return c.json({ data: result, error: null });
  } catch {
    return c.json(
      { data: null, error: { code: "INTERNAL_ERROR", message: "健康检查失败" } },
      // 类型收窄需要显式标注
    ) as any;
  }
});

// OpenAPI 规范文档（JSON）
openapiApp.doc("/openapi", {
  openapi: "3.1.0",
  info: {
    title: apiEnv.APP_NAME,
    version: apiEnv.APP_VERSION,
    description: "FeedMind API — 知识管理、AI 对话、内容爬取服务",
  },
  servers: [{ url: "/api/v1", description: "API v1" }],
});

// Scalar API 文档 UI
openapiApp.get(
  "/docs",
  apiReference({
    pageTitle: "FeedMind API 文档",
    spec: { url: "/api/v1/openapi" },
    theme: "purple",
    defaultHttpClient: { targetKey: "shell", clientKey: "curl" },
  }),
);
