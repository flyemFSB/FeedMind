import type { Client } from "@libsql/client";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import * as schema from "./schema/index.js";
import { dbLogger } from "./logger.js";

function resolveDbPath(): string {
  const envPath = process.env["DATABASE_PATH"];
  if (envPath && isAbsolute(envPath)) return envPath;
  const dataDir = process.env["DATA_DIR"] ?? resolve(process.cwd(), "data");
  return resolve(dataDir, "feedmind.db");
}

let _rawClient: Client | null = null;
let _rawDb: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _activeDbPath: string | null = null;

export function getRawClient(): Client {
  const currentPath = resolveDbPath();
  if (!_rawClient || _rawClient.closed || _activeDbPath !== currentPath) {
    if (_rawClient && !_rawClient.closed) {
      _rawClient.close();
    }
    try {
      mkdirSync(dirname(currentPath), { recursive: true });
    } catch {
      // 目录存在或只读按需忽略
    }
    _rawClient = createClient({
      url: `file:${currentPath.replace(/\\/g, "/")}`,
    });
    _activeDbPath = currentPath;
    _rawDb = drizzle(_rawClient, { schema });
  }
  return _rawClient;
}

export function getRawDb(): ReturnType<typeof drizzle<typeof schema>> {
  getRawClient();
  return _rawDb!;
}

// 惰性透明代理：使外部 import { client, db } 无缝透传到活跃实例，彻底解耦环境变量注入时序
export const client: Client = new Proxy({} as Client, {
  get(_target, prop, receiver) {
    const raw = getRawClient();
    const value = Reflect.get(raw, prop, receiver);
    return typeof value === "function" ? value.bind(raw) : value;
  },
});

export const db: ReturnType<typeof drizzle<typeof schema>> = new Proxy(
  {} as ReturnType<typeof drizzle<typeof schema>>,
  {
    get(_target, prop, receiver) {
      const raw = getRawDb();
      const value = Reflect.get(raw, prop, receiver);
      return typeof value === "function" ? value.bind(raw) : value;
    },
  },
);

// SQLite 运行参数（连接级，进程内生效）：
// - journal_mode=WAL：读写并发不互斥（FTS 批量重建与业务读请求并行），写入更快
// - synchronous=NORMAL：WAL 模式下崩溃安全（最多丢最近事务），日常写入大幅减 fsync
// - cache_size=-8000：页缓存上限 8MB，防大查询（FTS 重建/图遍历）撑爆内存
// 幂等，可在任意时机重复调用。
export async function initDbPragmas(): Promise<void> {
  const c = getRawClient();
  await c.execute("PRAGMA journal_mode = WAL");
  await c.execute("PRAGMA synchronous = NORMAL");
  await c.execute("PRAGMA cache_size = -8000");
}

export async function checkDbConnection(): Promise<boolean> {
  try {
    const c = getRawClient();
    await c.execute("select 1");
    return true;
  } catch (error) {
    dbLogger.error({ err: error }, "数据库连接检查失败");
    return false;
  }
}

export function closeDb(): void {
  if (_rawClient && !_rawClient.closed) {
    _rawClient.close();
    _rawClient = null;
    _rawDb = null;
    _activeDbPath = null;
  }
}
