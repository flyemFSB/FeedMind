import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { defineConfig } from "drizzle-kit";

// drizzle-kit 的 config loader 不提供 import.meta.dirname（非 Node 原生 ESM），
// 用 CWD 兜底：db:push 经 pnpm --filter @feedmind/db 运行，CWD 恒为 packages/db。
const configDir = process.cwd();
// 默认数据库位于项目根目录的 data/ 下（config 在 packages/db/，需上两级）
const defaultDbPath = "../../data/feedmind.db";
const dbPath = resolve(configDir, process.env.DATABASE_PATH || defaultDbPath);
mkdirSync(dirname(dbPath), { recursive: true });

// libsql 要求 "file:" URL，Windows 路径需转成正斜杠
const dbUrl = `file:${dbPath.replace(/\\/g, "/")}`;

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: dbUrl,
  },
});
