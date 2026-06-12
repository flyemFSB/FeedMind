import { Hono } from "hono";
import type { HonoBindings, HonoVariables } from "@mastra/hono";
import { apiEnv, validateApiRuntime } from "./env.js";
import { jsonError } from "./lib/http.js";
import { v1Router } from "./routes/v1/index.js";

/** 创建基础 Hono 应用（含 REST API 路由、错误处理），Mastra 由调用方注入 */
export function createApp(): Hono<{ Bindings: HonoBindings; Variables: HonoVariables }> {
  validateApiRuntime();

  const app = new Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>();

  app.notFound((c) => jsonError(c, 404, "HTTP_ERROR", "请求的资源不存在"));
  app.onError((error, c) => {
    if (error instanceof Error && "status" in error && "code" in error) {
      const httpError = error as { status: number; code: string; message: string; details?: Record<string, unknown> };
      return jsonError(c, httpError.status, httpError.code, httpError.message, httpError.details);
    }
    console.error("未处理异常", error);
    return jsonError(c, 500, "INTERNAL_SERVER_ERROR", "服务器暂时不可用");
  });

  app.get("/", (c) =>
    c.json({ name: apiEnv.APP_NAME, version: apiEnv.APP_VERSION }),
  );
  app.route("/api/v1", v1Router);

  return app;
}
