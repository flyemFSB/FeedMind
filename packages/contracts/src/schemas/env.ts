import { z } from "zod";

/**
 * Base environment schema shared across all apps.
 * Extend this schema in each app to add app-specific variables.
 */
export const baseEnvSchema = z.object({
  APP_ENV: z.string().default("development"),
  DATABASE_PATH: z.string().default("./data/feedmind.db"),
  ENCRYPTION_KEY: z.string().default(""),
});

export type BaseEnv = z.infer<typeof baseEnvSchema>;
