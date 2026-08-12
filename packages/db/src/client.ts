import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as schema from "./schema/index.js";
import { dbLogger } from "./logger.js";

// 以当前文件位置为基准定位项目根目录，不依赖 CWD
const thisDir = import.meta.dirname;
const projectRoot = resolve(thisDir, "..", "..", "..");
const DB_PATH = process.env["DATABASE_PATH"]
  ? resolve(projectRoot, process.env["DATABASE_PATH"])
  : resolve(projectRoot, "data", "feedmind.db");

mkdirSync(dirname(DB_PATH), { recursive: true });

// libsql 客户端（纯 JS 嵌入模式，无需原生编译）
const client = createClient({
  url: `file:${DB_PATH.replace(/\\/g, "/")}`,
});

export const db = drizzle(client, { schema });

// SQLite 运行参数（连接级，进程内生效）：
// - journal_mode=WAL：读写并发不互斥（FTS 批量重建与业务读请求并行），写入更快
// - synchronous=NORMAL：WAL 模式下崩溃安全（最多丢最近事务），日常写入大幅减 fsync
// - cache_size=-8000：页缓存上限 8MB，防大查询（FTS 重建/图遍历）撑爆内存
// 幂等，可在任意时机重复调用。
export async function initDbPragmas(): Promise<void> {
  await client.execute("PRAGMA journal_mode = WAL");
  await client.execute("PRAGMA synchronous = NORMAL");
  await client.execute("PRAGMA cache_size = -8000");
}

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
