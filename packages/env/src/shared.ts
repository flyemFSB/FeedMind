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
     * 生成命令：openssl rand -hex 32
     */
    ENCRYPTION_KEY: z.string().min(1, "ENCRYPTION_KEY 不能为空，请使用 openssl rand -hex 32 生成"),
  },
  runtimeEnv: process.env,
  skipValidation:
    !!process.env["SKIP_ENV_VALIDATION"] ||
    process.env["npm_lifecycle_event"] === "lint" ||
    process.env["npm_lifecycle_event"] === "typecheck",
});
