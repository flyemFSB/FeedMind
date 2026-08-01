import "./env-loader.js";

import { serve } from "@hono/node-server";
import { MastraServer } from "@mastra/hono";
import { createApp } from "./app.js";
import { apiEnv, validateApiRuntime } from "./env.js";
import { logger } from "./lib/logger.js";
import { initDatabase } from "@feedmind/db";
import { startIngestWorker } from "./modules/wiki/ingest-worker.js";
import { createMastra, initToolConfig } from "./mastra/index.js";
import { startLongConnection } from "./modules/remote-connection/feishu-service.js";

validateApiRuntime();

async function main(): Promise<void> {
  await initDatabase();

  if (apiEnv.DISABLE_INGEST_WORKER !== "1") {
    startIngestWorker();
  }

  initToolConfig();

  // 飞书 WebSocket 长连接（无需公网 IP，飞书服务器主动推送事件）
  await startLongConnection();

  const mastra = createMastra();
  const app = createApp();

  const mastraServer = new MastraServer({ app, mastra });
  await mastraServer.init();

  // 包装 app.fetch：仅对聊天路由改写请求 body。
  // 原先用 app.use("*") 注入 requestContext 是死代码——Hono 按注册顺序执行，
  // chatRoute handler 在 init 时已注册，会短路后续中间件。
  const baseFetch = app.fetch.bind(app);
  app.fetch = async (request: Request): Promise<Response> => {
    const isChat =
      request.method === "POST" && new URL(request.url).pathname.startsWith("/v1/agent/chat/");
    if (isChat) {
      try {
        const body = (await request.clone().json()) as {
          memory?: { thread?: string; resource?: string };
          requestContext?: Record<string, unknown>;
        };
        if (body && typeof body === "object") {
          let changed = false;

          // 请求未携带 memory.thread 时自动生成，否则 ObservationalMemory 会在调用 LLM 前硬失败
          if (!body.memory?.thread) {
            const threadId = crypto.randomUUID();
            body.memory = { thread: threadId, resource: threadId };
            body.requestContext = {
              ...(body.requestContext ?? {}),
              MastraMemory: { thread: { id: threadId }, resourceId: threadId },
            };
            changed = true;
          }

          // 从自定义 header 读取模型 ID，注入 requestContext（Mastra 会合并 body.requestContext）
          const modelId = request.headers.get("x-feedmind-model-id");
          if (modelId) {
            body.requestContext = { ...(body.requestContext ?? {}), feedmindModelId: modelId };
            changed = true;
          }

          if (changed) {
            const headers = new Headers(request.headers);
            headers.delete("content-length");
            request = new Request(request.url, {
              method: request.method,
              headers,
              body: JSON.stringify(body),
              signal: request.signal,
            });
          }
        }
      } catch {
        // 非 JSON body 保持原样透传
      }
    }
    return baseFetch(request);
  };

  serve({
    fetch: app.fetch,
    hostname: apiEnv.API_HOST,
    port: apiEnv.API_PORT,
  });
  logger.info({ host: apiEnv.API_HOST, port: apiEnv.API_PORT }, "服务启动完成");
}

main().catch((err: unknown) => {
  logger.fatal(err, "服务启动失败");
  process.exit(1);
});
