import type { Client } from "@libsql/client";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import * as schema from "./schema/index.ts";
import { dbLogger } from "./logger.ts";
import { findRepoRoot } from "./repo-root.ts";

function resolveDbPath(): string {
  const envPath = process.env["DATABASE_PATH"];
  if (envPath && (envPath === ":memory:" || isAbsolute(envPath))) return envPath;
  // 未指定路径时使用项目根目录下的数据目录
  const dataDir = process.env["DATA_DIR"] ?? join(findRepoRoot(import.meta.dirname), "data");
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
    if (currentPath === ":memory:") {
      _rawClient = createClient({
        url: "file::memory:?cache=shared",
      });
    } else {
      try {
        mkdirSync(dirname(currentPath), { recursive: true });
      } catch {
        // 目录已存在或只读时忽略创建异常
      }
      _rawClient = createClient({
        url: `file:${currentPath.replace(/\\/g, "/")}`,
      });
    }
    _activeDbPath = currentPath;
    _rawDb = drizzle(_rawClient, { schema });
  }
  return _rawClient;
}

export function getRawDb(): ReturnType<typeof drizzle<typeof schema>> {
  getRawClient();
  return _rawDb!;
}

// 惰性透明代理：外部解耦环境变量注入时序
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

/** 配置 SQLite 连接参数：开启外键约束、WAL 并发模式、内存映射与缓存上限 */
export async function initDbPragmas(): Promise<void> {
  const c = getRawClient();
  await c.execute("PRAGMA foreign_keys = ON");
  await c.execute("PRAGMA journal_mode = WAL");
  await c.execute("PRAGMA synchronous = NORMAL");
  await c.execute("PRAGMA cache_size = -8000");
  await c.execute("PRAGMA mmap_size = 67108864");
}

export async function checkDbConnection(): Promise<boolean> {
  try {
    const c = getRawClient();
    await c.execute("select 1");
    return true;
  } catch (error) {
    dbLogger.error({ err: error }, "数据库连接健康检查失败");
    return false;
  }
}

export async function shutdownDatabase(): Promise<void> {
  if (_rawClient && !_rawClient.closed) {
    try {
      await _rawClient.execute("PRAGMA wal_checkpoint(TRUNCATE)");
    } catch {
      // 忽略检查点异常
    }
    closeDb();
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

export { findRepoRoot };
