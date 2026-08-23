import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Hono } from "hono";

// 全量业务表 DDL：与 packages/db/src/schema 保持 100% 一致，供集成测试单进程极速建表
export const ALL_TABLE_DDLS = [
  `CREATE TABLE IF NOT EXISTS model (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL DEFAULT 'chat',
    provider TEXT NOT NULL,
    model_name TEXT NOT NULL,
    model_id TEXT NOT NULL DEFAULT '',
    base_url TEXT NOT NULL DEFAULT '',
    encrypted_api_key TEXT NOT NULL DEFAULT '',
    context_window TEXT,
    max_output TEXT,
    is_selected INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (current_timestamp),
    updated_at TEXT NOT NULL DEFAULT (current_timestamp),
    CONSTRAINT uq_model_type_endpoint_key UNIQUE (type, model_id, base_url, encrypted_api_key)
  )`,
  `CREATE TABLE IF NOT EXISTS runtime_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    runtime TEXT NOT NULL UNIQUE,
    llm_id INTEGER REFERENCES model(id) ON DELETE SET NULL,
    temperature REAL NOT NULL DEFAULT 0.2,
    top_p REAL NOT NULL DEFAULT 1,
    system_prompt TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS tools (
    name TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    display_name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    config_fields TEXT NOT NULL,
    config TEXT NOT NULL DEFAULT '{}',
    is_enabled INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (current_timestamp),
    updated_at TEXT NOT NULL DEFAULT (current_timestamp)
  )`,
  `CREATE TABLE IF NOT EXISTS crawler_tasks (
    id TEXT PRIMARY KEY,
    route TEXT NOT NULL,
    params TEXT NOT NULL,
    cookies TEXT,
    proxy_url TEXT,
    max_items INTEGER NOT NULL DEFAULT 50,
    status TEXT NOT NULL DEFAULT 'queued',
    progress INTEGER,
    error TEXT,
    rss_output TEXT,
    started_at TEXT,
    finished_at TEXT,
    created_at TEXT NOT NULL DEFAULT (current_timestamp)
  )`,
  `CREATE TABLE IF NOT EXISTS cookie_store (
    uuid TEXT NOT NULL,
    platform TEXT NOT NULL,
    cookies TEXT NOT NULL,
    valid INTEGER,
    checked_at TEXT,
    PRIMARY KEY (uuid, platform)
  )`,
  `CREATE TABLE IF NOT EXISTS cookie_cloud (
    uuid TEXT PRIMARY KEY,
    password TEXT NOT NULL,
    encrypted TEXT NOT NULL,
    crypto_type TEXT NOT NULL DEFAULT 'legacy'
  )`,
  `CREATE TABLE IF NOT EXISTS rss_sources (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    platform TEXT,
    route TEXT,
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    params TEXT,
    last_synced_at TEXT,
    created_at TEXT NOT NULL DEFAULT (current_timestamp),
    updated_at TEXT NOT NULL DEFAULT (current_timestamp)
  )`,
  `CREATE TABLE IF NOT EXISTS feeds (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    link TEXT,
    guid TEXT NOT NULL,
    author TEXT,
    category TEXT,
    image TEXT,
    pub_date TEXT,
    fetched_at TEXT NOT NULL,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (current_timestamp)
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_feeds_source_guid ON feeds (source_id, guid)`,
  `CREATE TABLE IF NOT EXISTS schedule_tasks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    cron TEXT NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
    enabled INTEGER NOT NULL DEFAULT 1,
    last_run_at TEXT,
    last_run_status TEXT,
    last_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS videos (
    id TEXT PRIMARY KEY,
    scheduleId TEXT NOT NULL,
    reportDate TEXT NOT NULL,
    status TEXT NOT NULL,
    stage TEXT,
    filePath TEXT,
    duration INTEGER,
    error TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS chat_sessions (
    id TEXT PRIMARY KEY,
    agent_thread_id TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL DEFAULT '新会话',
    pinned INTEGER NOT NULL DEFAULT 0,
    message_count INTEGER NOT NULL DEFAULT 0,
    last_message_at TEXT,
    created_at TEXT NOT NULL DEFAULT (current_timestamp),
    updated_at TEXT NOT NULL DEFAULT (current_timestamp)
  )`,
  `CREATE TABLE IF NOT EXISTS remote_connections (
    id TEXT PRIMARY KEY,
    platform TEXT NOT NULL,
    label TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'disconnected',
    config TEXT,
    extra TEXT,
    error TEXT,
    created_at TEXT NOT NULL DEFAULT (current_timestamp),
    updated_at TEXT NOT NULL DEFAULT (current_timestamp)
  )`,
  `CREATE TABLE IF NOT EXISTS operation_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    action TEXT NOT NULL,
    target TEXT NOT NULL,
    target_name TEXT NOT NULL,
    detail TEXT,
    result TEXT NOT NULL DEFAULT 'success'
  )`,
];

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
 * 启动一个自包含、内存隔离的 API 测试上下文。
 * 每个测试文件或 suite 独立调用，消除跨用例状态污染。
 */
export async function createApiTestContext(options?: {
  seedDefaults?: boolean;
}): Promise<ApiTestContext> {
  const tempDir = mkdtempSync(join(tmpdir(), "feedmind-api-test-"));
  process.env["DATABASE_PATH"] = join(tempDir, "test.db");

  const dbMod = await import("@feedmind/db");

  for (const ddl of ALL_TABLE_DDLS) {
    await dbMod.client.execute(ddl);
  }

  if (options?.seedDefaults ?? true) {
    await dbMod.initDatabase();
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
    dbMod.closeDb();
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // 忽略临时文件释放时的偶发延迟
    }
  };

  return {
    app,
    dbMod,
    tempDir,
    cleanup,
    request,
  };
}
