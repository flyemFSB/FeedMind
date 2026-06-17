import { sharedEnv } from "./shared.js";

/** 判断当前是否为生产环境 */
export function isProduction(appEnv?: string): boolean {
  const env = (appEnv ?? sharedEnv.APP_ENV).trim().toLowerCase();
  return ["prod", "production"].includes(env);
}

/**
 * 校验 ENCRYPTION_KEY 是否可用（调用一次加密操作验证）。
 * 在 API 启动时调用，确保密钥正确配置。
 */
export function requireEncryptionKey(): string {
  const key = sharedEnv.ENCRYPTION_KEY.trim();
  if (!key) {
    throw new Error("ENCRYPTION_KEY is not set. Configure it in .env before starting the server.");
  }
  return key;
}
