import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { apiEnv } from "./env.js";

// 启动 Hono HTTP 服务
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
