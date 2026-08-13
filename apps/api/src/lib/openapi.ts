import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { RouteHandler } from "@hono/zod-openapi";
import { apiReference } from "@scalar/hono-api-reference";
import { APP_NAME, APP_VERSION } from "./constants.js";
import { getHealth } from "../modules/health/service.js";
import {
  beginRegistration,
  pollRegistration,
} from "../modules/remote-connection/feishu-registration.js";
import { HttpError } from "./http.js";

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
    // 与 contracts 信封保持同一结构（i18n 锚点 + 参数），openapi 文档类型与实现一致
    i18n: z
      .object({
        key: z.string(),
        params: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
      })
      .optional(),
    details: z.record(z.string(), z.unknown()).optional(),
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
    // HttpError 已带用户可读消息与 i18n 锚点（网络失败/授权失败），原样透传
    const e = err instanceof HttpError ? err : null;
    // beginRegistration 只抛 502（网络失败/授权失败），断言收窄到 schema 声明的 502
    const status = (e?.status ?? 502) as 502;
    return c.json(
      {
        data: null,
        error: {
          code: e?.code ?? "REGISTER_BEGIN_FAILED",
          message: e?.message ?? (err instanceof Error ? err.message : "创建注册会话失败"),
          details: e?.details ?? {},
          ...(e?.i18nKey
            ? {
                i18n: {
                  key: e.i18nKey,
                  ...(e.i18nParams ? { params: e.i18nParams } : {}),
                },
              }
            : {}),
        },
      },
      status,
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
