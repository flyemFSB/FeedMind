import { Hono } from "hono";
import { requestId } from "hono/request-id";
import type { HonoBindings, HonoVariables } from "@mastra/hono";
import { validateApiRuntime } from "./env.js";
import { APP_NAME, APP_VERSION } from "./lib/constants.js";
import { HttpError, jsonError } from "./lib/http.js";
import { logger } from "./lib/logger.js";
import { openapiApp } from "./lib/openapi.js";
import { v1Router } from "./routes/v1/index.js";

/** 供 server.ts 和测试分别组装 Mastra / 纯 REST 场景 */
export function createApp(): Hono<{ Bindings: HonoBindings; Variables: HonoVariables }> {
  validateApiRuntime();

  const app = new Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>();

  app.use("*", requestId());
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
    // 健康检查等高频接口用 debug 避免日志刷屏
    if (c.res.status >= 500) logger.error(details, "请求完成");
    else if (c.res.status >= 400) logger.warn(details, "请求完成");
    else logger.debug(details, "请求完成");
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
  app.route("/api/v1", openapiApp);

  return app;
}
