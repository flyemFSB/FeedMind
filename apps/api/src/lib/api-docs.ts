import { apiReference } from "@scalar/hono-api-reference";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { APP_NAME, APP_VERSION } from "./constants.js";

/**
 * 把 OpenAPI 规范与 Scalar 文档 UI 挂到 v1 路由树上。
 *
 * 挂在 v1Router 自身而非另起一个 router —— 后者会与业务路由争抢同一命名空间
 * （Hono 按注册顺序匹配，同名路径的后者永不生效）。同树共享 registry，
 * 且 route() 合并子路由时会自动拼接路径前缀，故 /openapi 描述的是全量端点。
 */
export function mountApiDocs(app: OpenAPIHono): void {
  app.doc("/openapi", {
    openapi: "3.1.0",
    info: {
      title: APP_NAME,
      version: APP_VERSION,
      description: "FeedMind API — 知识管理、AI 对话、内容爬取服务",
    },
    servers: [{ url: "/api/v1", description: "API v1" }],
  });

  app.get(
    "/docs",
    apiReference({
      pageTitle: "FeedMind API 文档",
      spec: { url: "/api/v1/openapi" },
      theme: "purple",
      defaultHttpClient: { targetKey: "shell", clientKey: "curl" },
    }),
  );
}
