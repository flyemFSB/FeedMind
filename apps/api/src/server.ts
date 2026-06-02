import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { apiEnv } from "./env.js";
import { initDatabase } from "@feedmind/db";

async function main(): Promise<void> {
  // 初始化数据库（建表 + 种子工具）
  await initDatabase();

  // 启动 HTTP 服务
  serve(
    {
      fetch: createApp().fetch,
      hostname: apiEnv.API_HOST,
      port: apiEnv.API_PORT,
    },
    (info) => {
      console.log(`FeedMind API listening on http://${info.address}:${info.port}`);
    },
  );
}

main().catch((err: unknown) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
