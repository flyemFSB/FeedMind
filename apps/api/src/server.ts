import { serve } from "@hono/node-server";
import { MastraServer } from "@mastra/hono";
import { createApp } from "./app.js";
import { apiEnv } from "./env.js";
import { initDatabase } from "@feedmind/db";
import { startIngestWorker } from "./modules/wiki/ingest-worker.js";
import { createMastra, initToolConfig } from "./mastra/index.js";

async function main(): Promise<void> {
  await initDatabase();

  if (process.env.DISABLE_INGEST_WORKER !== "1") {
    startIngestWorker();
  }

  // 初始化工具配置客户端
  initToolConfig(`http://${apiEnv.API_HOST}:${apiEnv.API_PORT}`);

  // 创建 Mastra 实例
  const mastra = createMastra();

  // 创建 Hono 应用
  const app = createApp();

  // MastraServer 负责初始化 requestContext 等中间件基础设施
  const mastraServer = new MastraServer({ app, mastra });
  await mastraServer.init();

  serve(
    {
      fetch: app.fetch,
      hostname: apiEnv.API_HOST,
      port: apiEnv.API_PORT,
    },
    (info) => {
      console.log(`FeedMind API + Agent listening on http://${info.address}:${info.port}`);
    },
  );
}

main().catch((err: unknown) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
