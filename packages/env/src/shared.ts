import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/** 所有应用和服务共享的基础环境变量 */
export const sharedEnv = createEnv({
  server: {
    /** 运行环境：development / production / test */
    APP_ENV: z.string().default("development"),
    /** SQLite 数据库文件路径 */
    DATABASE_PATH: z.string().default("./data/feedmind.db"),
    /**
     * AES 加密密钥，用于加密存储的 API Key 等敏感数据。
     * 首次使用后请保持稳定，否则已加密数据无法解密。
     * 桌面端零配置下由主进程自动生成持久化 .secret_key 注入。
     */
    ENCRYPTION_KEY: z
      .string()
      .min(1)
      .default(
        () =>
          process.env["ENCRYPTION_KEY"] ??
          "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      ),
  },
  runtimeEnv: process.env,
  // .env 中 KEY=（空串）视为未设置：避免空串覆盖 zod default（官方推荐显式开启）
  emptyStringAsUndefined: true,
  skipValidation:
    !!process.env["SKIP_ENV_VALIDATION"] ||
    process.env["npm_lifecycle_event"] === "lint" ||
    process.env["npm_lifecycle_event"] === "typecheck",
});
