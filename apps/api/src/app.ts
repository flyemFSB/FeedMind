import { Hono } from "hono";
import { requestId } from "hono/request-id";
import type { HonoBindings, HonoVariables } from "@mastra/hono";
import { validateApiRuntime } from "./env.js";
import { APP_NAME, APP_VERSION } from "./lib/constants.js";
import { jsonError } from "./lib/http.js";
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

  app.notFound((c) => jsonError(c, 404, "HTTP_ERROR", "请求的资源不存在"));
  app.onError((error, c) => {
    if (error instanceof Error && "status" in error && "code" in error) {
      const httpError = error as {
        status: number;
        code: string;
        message: string;
        details?: Record<string, unknown>;
      };
      return jsonError(c, httpError.status, httpError.code, httpError.message, httpError.details);
    }
    logger.error({ err: error }, "未处理的全局异常");
    return jsonError(c, 500, "INTERNAL_SERVER_ERROR", "服务器暂时不可用");
  });

  app.get("/", (c) => c.json({ name: APP_NAME, version: APP_VERSION }));
  app.route("/api/v1", v1Router);
  app.route("/api/v1", openapiApp);

  return app;
}
