import { Hono } from "hono";
import { apiEnv, validateApiRuntime } from "./env.js";
import { HttpError, jsonError } from "./lib/http.js";
import { v1Router } from "./routes/v1/index.js";

// 创建并配置 Hono 应用实例
export function createApp(): Hono {
  // 生产环境必须设置加密密钥
  validateApiRuntime();

  const app = new Hono();

  // 统一 404 处理，避免路由穿透暴露内部路径
  app.notFound((c) => jsonError(c, 404, "HTTP_ERROR", "请求的资源不存在"));
  app.onError((error, c) => {
    if (error instanceof HttpError) {
      return jsonError(c, error.status, error.code, error.message, error.details);
    }

    // 未预期异常兜底，防止泄漏内部调用栈
    console.error("未处理异常", error);
    return jsonError(c, 500, "INTERNAL_SERVER_ERROR", "服务器暂时不可用");
  });

  app.get("/", (c) =>
    c.json({
      name: apiEnv.APP_NAME,
      version: apiEnv.APP_VERSION,
    }),
  );
  app.route("/api/v1", v1Router);

  return app;
}
