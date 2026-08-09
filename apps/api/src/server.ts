import "./env-loader.js";

import { startApi } from "./server-core.js";
import { logger } from "./lib/logger.js";

async function main(): Promise<void> {
  const server = await startApi();
  logger.info("服务启动完成");

  // 聊天路由是 SSE 长连接，server.close 会等它结束，用超时兜底避免挂死
  const shutdown = (signal: string) => {
    logger.info({ signal }, "收到退出信号，开始优雅关闭");
    server.close(() => {
      logger.flush();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

main().catch((err: unknown) => {
  logger.fatal(err, "服务启动失败");
  process.exit(1);
});
