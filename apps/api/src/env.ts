import { baseEnvSchema } from "@feedmind/contracts";
import { isProduction } from "@feedmind/shared";
import { z } from "zod";

const apiEnvSchema = baseEnvSchema.extend({
  APP_NAME: z.string().default("FeedMind API"),
  APP_VERSION: z.string().default("0.1.0"),
  API_HOST: z.string().default("127.0.0.1"),
  API_PORT: z.coerce.number().int().positive().default(8000),
});

export const apiEnv = apiEnvSchema.parse(Bun.env);

// 生产环境强制校验加密密钥，防止 API Key 明文存储
export function validateApiRuntime(): void {
  if (isProduction(apiEnv.APP_ENV) && !apiEnv.ENCRYPTION_KEY.trim()) {
    throw new Error("ENCRYPTION_KEY must be set in production.");
  }
}
