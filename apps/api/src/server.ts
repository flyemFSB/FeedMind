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

  // 从自定义 header 读取模型 ID，注入 requestContext（避免 body 中携带导致重复）
  app.use("*", async (c, next) => {
    const modelId = c.req.header("x-feedmind-model-id");
    if (modelId) {
      const rc = c.get("requestContext");
      rc?.set("feedmindModelId", modelId);
    }
    await next();
  });

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
