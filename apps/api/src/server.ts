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
  initToolConfig();

  // 创建 Mastra 实例
  const mastra = createMastra();

  // 创建 Hono 应用
  const app = createApp();

  // MastraServer 负责初始化 requestContext 等中间件基础设施
  const mastraServer = new MastraServer({ app, mastra });
  await mastraServer.init();

  // 从自定义 header 读取模型 ID，注入 requestContext（避免 body 中携带 requestContext 导致重复）
  app.use("*", async (c, next) => {
    const modelId = c.req.header("x-feedmind-model-id");
    if (modelId) {
      const rc = c.get("requestContext");
      if (rc) {
        rc.set("feedmindModelId", modelId);
      }
    }
    await next();
  });

  Bun.serve({
    fetch: app.fetch,
    hostname: apiEnv.API_HOST,
    port: apiEnv.API_PORT,
  });
  console.log(`FeedMind API + Agent listening on http://${apiEnv.API_HOST}:${apiEnv.API_PORT}`);
}

main().catch((err: unknown) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
