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

// 统一数据库 URL 格式为 postgres://，避免 pg driver 不兼容 postgresql:// 前缀
export function normalizeDatabaseUrl(value: string): string {
  return value
    .replace(/^postgresql\+psycopg:\/\//, "postgres://")
    .replace(/^postgresql:\/\//, "postgres://")
    .replace("localhost", "127.0.0.1");
}

export const baseEnvSchema = z.object({
  APP_ENV: z.string().default("development"),
  DATABASE_URL: z
    .string()
    .default("postgres://postgres:postgres@127.0.0.1:5432/feedmind")
    .transform(normalizeDatabaseUrl),
  ENCRYPTION_KEY: z.string().default(""),
});

export type BaseEnv = z.infer<typeof baseEnvSchema>;

export function isProduction(appEnv: string): boolean {
  return ["prod", "production"].includes(appEnv.trim().toLowerCase());
}
