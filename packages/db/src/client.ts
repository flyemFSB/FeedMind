import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "./schema/index.js";
import { dbLogger } from "./logger.js";

// 以当前文件位置为基准定位项目根目录，不依赖 CWD
const thisDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(thisDir, "..", "..", "..");
const DB_PATH = process.env.DATABASE_PATH
  ? resolve(projectRoot, process.env.DATABASE_PATH)
  : resolve(projectRoot, "data", "feedmind.db");

// 确保目录存在
mkdirSync(dirname(DB_PATH), { recursive: true });

// libsql 客户端（纯 JS 嵌入模式，无需原生编译）
const client = createClient({
  url: `file:${DB_PATH.replace(/\\/g, "/")}`,
});

export const db = drizzle(client, { schema });

export async function checkDbConnection(): Promise<boolean> {
  try {
    await client.execute("select 1");
    return true;
  } catch (error) {
    dbLogger.error("数据库连接检查失败", error);
    return false;
  }
}

export function closeDb(): void {
  client.close();
}

export { client };
