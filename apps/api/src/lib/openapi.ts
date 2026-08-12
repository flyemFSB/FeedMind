import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { RouteHandler } from "@hono/zod-openapi";
import { apiReference } from "@scalar/hono-api-reference";
import { APP_NAME, APP_VERSION } from "./constants.js";
import { getHealth } from "../modules/health/service.js";
import {
  beginRegistration,
  pollRegistration,
} from "../modules/remote-connection/feishu-registration.js";

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

const healthHandler: RouteHandler<typeof healthRoute> = async (c) => {
  try {
    const result = await getHealth();
    return c.json({ data: result, error: null }, 200);
  } catch {
    return c.json({ data: null, error: { code: "INTERNAL_ERROR", message: "健康检查失败" } }, 500);
  }
};
openapiApp.openapi(healthRoute, healthHandler);

// ─── 飞书扫码注册（一键创建应用） ───────────────────────────
// 响应统一走 { data, error } 信封，与 jsonOk/jsonError 一致

const registerBeginDataSchema = z.object({
  deviceCode: z.string().describe("注册会话设备码"),
  qrUrl: z.string().describe("扫码授权二维码链接"),
  interval: z.number().describe("轮询间隔（秒）"),
  expireIn: z.number().describe("二维码有效期（秒）"),
});

const registerPollDataSchema = z.object({
  status: z.enum(["pending", "success", "error"]),
  appId: z.string().optional(),
  appSecret: z.string().optional(),
  error: z.string().optional(),
});

const apiErrorSchema = z.object({
  data: z.null(),
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

const registerBeginRoute = createRoute({
  method: "post",
  path: "/remote-connections/feishu/register/begin",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ data: registerBeginDataSchema, error: z.null() }),
        },
      },
      description: "创建飞书扫码注册会话，返回二维码链接",
    },
    502: {
      content: { "application/json": { schema: apiErrorSchema } },
      description: "注册会话创建失败",
    },
  },
});

const registerBeginHandler: RouteHandler<typeof registerBeginRoute> = async (c) => {
  try {
    const data = await beginRegistration();
    return c.json({ data, error: null }, 200);
  } catch (err) {
    return c.json(
      {
        data: null,
        error: {
          code: "REGISTER_BEGIN_FAILED",
          message: err instanceof Error ? err.message : "创建注册会话失败",
        },
      },
      502,
    );
  }
};
openapiApp.openapi(registerBeginRoute, registerBeginHandler);

const registerPollRoute = createRoute({
  method: "post",
  path: "/remote-connections/feishu/register/poll",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({ deviceCode: z.string().describe("注册会话设备码") }),
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ data: registerPollDataSchema, error: z.null() }),
        },
      },
      description: "轮询扫码授权结果",
    },
    502: {
      content: { "application/json": { schema: apiErrorSchema } },
      description: "轮询注册状态失败",
    },
  },
});

const registerPollHandler: RouteHandler<typeof registerPollRoute> = async (c) => {
  try {
    const { deviceCode } = c.req.valid("json");
    const data = await pollRegistration(deviceCode);
    return c.json({ data, error: null }, 200);
  } catch (err) {
    return c.json(
      {
        data: null,
        error: {
          code: "REGISTER_POLL_FAILED",
          message: err instanceof Error ? err.message : "轮询注册状态失败",
        },
      },
      502,
    );
  }
};
openapiApp.openapi(registerPollRoute, registerPollHandler);

// OpenAPI 规范文档（JSON）
openapiApp.doc("/openapi", {
  openapi: "3.1.0",
  info: {
    title: APP_NAME,
    version: APP_VERSION,
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
