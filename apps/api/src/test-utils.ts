import type { Hono } from "hono";

async function loadDb() {
  return import("@feedmind/db");
}
export type DbModule = Awaited<ReturnType<typeof loadDb>>;

import type { HonoBindings, HonoVariables } from "@mastra/hono";

export interface ApiTestContext {
  app: Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>;
  dbMod: DbModule;
  tempDir: string;
  cleanup: () => Promise<void>;
  request: <T = Record<string, unknown>>(
    path: string,
    options?: {
      method?: string;
      body?: unknown;
      headers?: Record<string, string>;
    },
  ) => Promise<{
    status: number;
    headers: Headers;
    body: {
      data: T;
      error: { code: string; message: string; details?: unknown; i18n?: unknown } | null;
    };
    rawText: string;
  }>;
}

/**
 * 进程内 schema SQL 模板。首次走 ensureSchema（与生产同源），
 * 之后空库直接回放 DDL——drizzle-kit push 每用例 1s+，并行下会把 hook 顶过 30s。
 * 仅测试进程内缓存；生产 initDatabase 路径不变。
 */
let schemaSqlCache: string[] | null = null;

async function dumpSchemaSql(client: DbModule["client"]): Promise<string[]> {
  const rows = await client.execute(
    `SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid`,
  );
  return rows.rows.map((r) => String(r["sql"]));
}

/**
 * 启动一个自包含、内存隔离的 API 测试上下文。
 * 表结构由 @feedmind/db ensureSchema 统一创建，与生产同构。
 */
export async function createApiTestContext(options?: {
  seedDefaults?: boolean;
}): Promise<ApiTestContext> {
  process.env["DATABASE_PATH"] = ":memory:";

  const dbMod = await import("@feedmind/db");

  // 重置共享内存库中的现有表与视图，保障用例间严格隔离
  await dbMod.initDbPragmas();
  await dbMod.client.execute("PRAGMA foreign_keys = OFF");
  const existingTables = await dbMod.client.execute(
    "SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'",
  );
  for (const row of existingTables.rows) {
    await dbMod.client.execute(`DROP ${row["type"]} IF EXISTS "${row["name"]}"`);
  }
  await dbMod.client.execute("PRAGMA foreign_keys = ON");

  // 首次 ensureSchema 成功后缓存 DDL；后续空库直接回放 + seed，避开 push 非幂等与耗时
  if (!schemaSqlCache) {
    if (options?.seedDefaults ?? true) {
      await dbMod.initDatabase();
    } else {
      await dbMod.initDbPragmas();
      await dbMod.ensureSchema(dbMod.client);
    }
    schemaSqlCache = await dumpSchemaSql(dbMod.client);
  } else {
    for (const sql of schemaSqlCache) {
      await dbMod.client.execute(sql);
    }
    if (options?.seedDefaults ?? true) {
      await dbMod.seedDatabase();
    }
  }

  const { createApp } = await import("./app.js");
  const app = createApp();

  const request: ApiTestContext["request"] = async <T = Record<string, unknown>>(
    path: string,
    reqOpts?: { method?: string; body?: unknown; headers?: Record<string, string> },
  ) => {
    const method = reqOpts?.method ?? "GET";
    const headers = new Headers(reqOpts?.headers ?? {});
    let body: string | undefined;

    if (reqOpts?.body !== undefined) {
      if (typeof reqOpts.body === "string") {
        body = reqOpts.body;
      } else {
        body = JSON.stringify(reqOpts.body);
        if (!headers.has("content-type")) {
          headers.set("content-type", "application/json");
        }
      }
    }

    const res = await app.request(path, {
      method,
      headers,
      ...(body !== undefined ? { body } : {}),
    });

    const rawText = await res.text();
    let parsedBody: unknown = null;
    try {
      parsedBody = rawText ? JSON.parse(rawText) : null;
    } catch {
      parsedBody = rawText;
    }

    return {
      status: res.status,
      headers: res.headers,
      body: parsedBody as {
        data: T;
        error: { code: string; message: string; details?: unknown; i18n?: unknown } | null;
      },
      rawText,
    };
  };

  const cleanup = async () => {
    // 释放数据库前微任务排空，防止路由中 void 的异步操作（如审计日志）在连接关闭后报错
    await new Promise((resolve) => setTimeout(resolve, 10));
    dbMod.closeDb();
  };

  return {
    app,
    dbMod,
    tempDir: ":memory:",
    cleanup,
    request,
  };
}
