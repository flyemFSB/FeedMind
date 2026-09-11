import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { methodNotAllowed } from "hono/method-not-allowed";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import type { HonoBindings, HonoVariables } from "@mastra/hono";
import type { ApiEnvelope } from "@feedmind/contracts";
import { validateApiRuntime } from "./env.js";
import { APP_NAME, APP_VERSION } from "./lib/constants.js";
import { HttpError, jsonError } from "./lib/http.js";
import { logger } from "./lib/logger.js";
import { v1Router } from "./routes/v1/index.js";

// 本机回环来源（vite dev 端口、Electron 同源端口等任意本机端口）。
// 生产 UI 与 API 同源、dev 经 Vite 代理亦同源，本不依赖跨源；放行 loopback 仅为
// 本地调试页直连留口子。其余来源（用户浏览器里的任意网页）不返回 ACAO 头被浏览器拦截，
// 避免携带凭证跨源打本地 API（服务存有 Cookie/密钥，是最典型的 localhost CSRF 面）。
function isLoopbackOrigin(origin: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\/?$/.test(origin);
}

/** 供 server.ts 和测试分别组装 Mastra / 纯 REST 场景 */
export function createApp(): Hono<{ Bindings: HonoBindings; Variables: HonoVariables }> {
  validateApiRuntime();

  const app = new Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>();

  app.use("*", requestId());
  app.use("*", secureHeaders());
  app.use(
    "*",
    cors({
      // 回调返回 falsy 即拒绝（hono cors 约定：不设置 ACAO 头）；无 Origin 的请求（curl/同源）不受影响
      origin: (origin) => (isLoopbackOrigin(origin) ? origin : null),
      // QUERY 为 RFC 10008 带体查询方法（hono 4.13 一等支持），wiki 搜索已采用
      allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "QUERY", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "X-Request-Id", "x-feedmind-model-id"],
      exposeHeaders: ["Content-Length", "X-Request-Id"],
      maxAge: 600,
      credentials: true,
    }),
  );

  // 限制请求体最大 25MB，防止超大文档上传导致内存溢出
  app.use(
    "*",
    bodyLimit({
      maxSize: 25 * 1024 * 1024,
      onError: (c) =>
        jsonError(
          c,
          413,
          "PAYLOAD_TOO_LARGE",
          "请求体超出最大允许大小（25MB）",
          {},
          { key: "apiError.payloadTooLarge" },
        ),
    }),
  );

  // 记录请求耗时与状态（高频接口如健康检查走 debug 级别，避免日志刷屏）
  app.use("*", async (c, next) => {
    const startedAt = performance.now();
    await next();

    const details = {
      requestId: c.res.headers.get("X-Request-Id"),
      method: c.req.method,
      route: c.req.routePath,
      status: c.res.status,
      durationMs: Math.round(performance.now() - startedAt),
    };
    if (c.res.status >= 500) logger.error(details, "请求处理异常");
    else if (c.res.status >= 400) logger.warn(details, "请求客户端错误");
    else logger.debug(details, "请求处理成功");
  });

  app.notFound((c) =>
    jsonError(
      c,
      404,
      "HTTP_ERROR",
      "请求的资源不存在",
      {},
      {
        key: "apiError.notFound",
      },
    ),
  );
  app.onError((error, c) => {
    if (error instanceof HttpError) {
      return jsonError(
        c,
        error.status,
        error.code,
        error.message,
        error.details,
        error.i18nKey ? { key: error.i18nKey, params: error.i18nParams } : undefined,
      );
    }
    logger.error({ err: error, cause: error.cause }, "未处理的全局异常");
    // 不暴露内部错误细节（安全），但给用户行动指引：发生了什么 + 下一步
    return jsonError(
      c,
      500,
      "INTERNAL_SERVER_ERROR",
      "操作未完成，请重试；若问题持续，请查看应用日志后反馈",
      {},
      { key: "apiError.internalError" },
    );
  });

  app.get("/", (c) => c.json({ name: APP_NAME, version: APP_VERSION }));
  app.route("/api/v1", v1Router);

  // 已注册路径用了不匹配的方法时回 405 + Allow（代替笼统 404）；须在全部路由注册后追加：
  // middleware 在 next() 结果为 404 时按 app.routes 反查该路径允许的方法
  app.use(
    "*",
    methodNotAllowed({
      app,
      onMethodNotAllowed: (c, methods) =>
        c.json<ApiEnvelope<never>>(
          {
            data: null,
            error: {
              code: "METHOD_NOT_ALLOWED",
              message: "请求方法不被该资源支持",
              details: { allow: methods },
            },
          },
          405,
          { Allow: methods.join(", ") },
        ),
    }),
  );

  return app;
}
