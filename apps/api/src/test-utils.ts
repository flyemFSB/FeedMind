import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
 * 启动一个自包含、内存隔离的 API 测试上下文。
 * 表结构由 @feedmind/db ensureSchema 统一创建，与生产同构。
 */
export async function createApiTestContext(options?: {
  seedDefaults?: boolean;
}): Promise<ApiTestContext> {
  const tempDir = mkdtempSync(join(tmpdir(), "feedmind-api-test-"));
  process.env["DATABASE_PATH"] = join(tempDir, "test.db");

  const dbMod = await import("@feedmind/db");
  // initDatabase = pragmas + ensureSchema + seed；勿再单独 ensureSchema（push 非幂等）
  if (options?.seedDefaults ?? true) {
    await dbMod.initDatabase();
  } else {
    await dbMod.initDbPragmas();
    await dbMod.ensureSchema(dbMod.client);
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
      // 忽略临时文件释放的偶发延迟
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
