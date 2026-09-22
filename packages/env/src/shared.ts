import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/** 所有应用和服务共享的基础环境变量 */
export const sharedEnv = createEnv({
  server: {
    /** 运行环境：development / production / test */
    APP_ENV: z.string().default("development"),
    /** SQLite 数据库文件路径覆盖，运行时默认由 DATA_DIR 推导 */
    DATABASE_PATH: z.string().optional(),
    /** AES 敏感数据加密主密钥，桌面端由主进程注入，服务端在启动时校验 */
    ENCRYPTION_KEY: z.string().optional(),
  },
  runtimeEnv: process.env,
  // .env 中 KEY=（空串）视为未设置：避免空串覆盖 zod default（官方推荐显式开启）
  emptyStringAsUndefined: true,
});
