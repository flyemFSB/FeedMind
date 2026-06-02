import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "drizzle-kit";

// 以 drizzle.config.ts 自身位置为基准解析路径，不依赖 CWD
const configDir = dirname(fileURLToPath(import.meta.url));
// 默认数据库位于项目根目录的 data/ 下（config 在 packages/db/，需上两级）
const defaultDbPath = "../../data/feedmind.db";
const dbPath = resolve(configDir, process.env.DATABASE_PATH || defaultDbPath);
mkdirSync(dirname(dbPath), { recursive: true });

// libsql requires "file:" URL; Windows 路径需转成正斜杠
const dbUrl = `file:${dbPath.replace(/\\/g, "/")}`;

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: dbUrl,
  },
});
