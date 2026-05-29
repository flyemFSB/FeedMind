import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { baseEnvSchema, loadFeedMindEnv } from "@feedmind/shared";
import * as schema from "./schema/index.js";

loadFeedMindEnv();
const env = baseEnvSchema.parse(process.env);

// 单例连接池，max=10 适用于中小并发场景
let pool: Pool | undefined;

export function getPool(): Pool {
  pool ??= new Pool({
    connectionString: env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  return pool;
}

export const db = drizzle(getPool(), { schema });

// 健康检查：向数据库发送轻量查询验证连接可用
export async function checkDbConnection(): Promise<boolean> {
  try {
    await getPool().query("select 1");
    return true;
  } catch (error) {
    console.error("数据库连接检查失败", error);
    return false;
  }
}

// 优雅关闭连接池（用于进程退出或测试清理）
export async function closePool(): Promise<void> {
  if (!pool) return;
  await pool.end();
  pool = undefined;
}
