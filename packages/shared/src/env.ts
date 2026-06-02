import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { z } from "zod";

let loaded = false;

function candidateEnvFiles(): string[] {
  const cwd = process.cwd();
  return [
    join(cwd, ".env"),
    join(cwd, "..", ".env"),
    join(cwd, "..", "..", ".env"),
    join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", ".env"),
  ].map((path) => resolve(path));
}

// 从 CWD 向上逐级查找 .env 文件，避免 .env 被过早加载导致变量丢失
export function loadFeedMindEnv(): void {
  if (loaded) return;
  loaded = true;

  for (const envFile of candidateEnvFiles()) {
    if (existsSync(envFile)) {
      config({ path: envFile, override: false });
      return;
    }
  }
}

export const baseEnvSchema = z.object({
  APP_ENV: z.string().default("development"),
  DATABASE_PATH: z
    .string()
    .default("./data/feedmind.db"),
  ENCRYPTION_KEY: z.string().default(""),
});

export type BaseEnv = z.infer<typeof baseEnvSchema>;

export function isProduction(appEnv: string): boolean {
  return ["prod", "production"].includes(appEnv.trim().toLowerCase());
}
