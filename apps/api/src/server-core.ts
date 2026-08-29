// 全局启用 zod schema 自动编译：此后构造的 schema 首次解析时生成快速路径，
// 复杂 schema 解析提速数倍；含 coerce/递归等不支持的 schema 静默回退常规解析。
// 必须先于本模块图中所有会构造 schema 的业务 import（ESM 按声明顺序求值）。
import "zod/compile";
import { createReadStream, existsSync, statSync } from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";
import type { ServerType } from "@hono/node-server";
import { serve } from "@hono/node-server";
import { MastraServer } from "@mastra/hono";
import { initDatabase, initDbPragmas } from "@feedmind/db";
import { createApp } from "./app.js";
import { apiEnv, validateApiRuntime } from "./env.js";
import { startIngestWorker } from "./modules/wiki/ingest-worker.js";
import { startDailyReportScheduler } from "./modules/daily-report/schedule-sync.js";
import { setMastra } from "./modules/daily-report/mastra-holder.js";
import { createMastra, initToolConfig } from "./mastra/index.js";
import { startLongConnection } from "./modules/remote-connection/feishu-service.js";

export interface StartApiOptions {
  /** Web 构建产物目录：提供时在 fetch 层提供同源静态资源 + SPA 回退（Electron 生产模式） */
  webDist?: string;
}

/**
 * 启动完整 API 服务（DB、Worker、Mastra Agent、HTTP Server）。
 * 同时供 CLI 入口（apps/api/src/server.ts）与 Electron 主进程复用。
 */
export async function startApi(options: StartApiOptions = {}): Promise<ServerType> {
  validateApiRuntime();

  // 先切 WAL/同步级别再建表写种子
  await initDbPragmas();
  await initDatabase();

  initToolConfig();

  const mastra = createMastra();
  setMastra(mastra);
  const app = createApp();

  const mastraServer = new MastraServer({ app, mastra });
  await mastraServer.init();

  const webDist = options.webDist ? path.resolve(options.webDist) : undefined;

  // 包装 app.fetch：对聊天路由改写请求 URL 与 body，并拦截非 /api 的 GET 提供静态资源。
  // 原先用 app.use("*") 注入 requestContext 是死代码——Hono 按注册顺序执行，
  // chatRoute handler 在 init 时已注册，会短路后续中间件。静态服务同理放 fetch 层，
  // 否则会被 createApp 里已注册的 GET "/"（版本号 JSON）短路。
  const baseFetch = app.fetch.bind(app);
  app.fetch = async (request: Request): Promise<Response> => {
    let url = new URL(request.url);

    // 补齐 vite dev 的 /api/chat → /v1/agent/chat 代理重写，让同源生产模式可直连
    if (url.pathname.startsWith("/api/chat/")) {
      url.pathname = url.pathname.replace(/^\/api\/chat/, "/v1/agent/chat");
      request = new Request(url, request);
      url = new URL(request.url);
    }

    const isChat = request.method === "POST" && url.pathname.startsWith("/v1/agent/chat/");
    if (isChat) {
      try {
        const body = (await request.clone().json()) as {
          memory?: { thread?: string; resource?: string };
          requestContext?: Record<string, unknown>;
        };
        if (body && typeof body === "object") {
          let changed = false;

          // 请求未携带 memory.thread 时自动生成，否则 ObservationalMemory 会在调用 LLM 前硬失败
          if (!body.memory?.thread) {
            const threadId = crypto.randomUUID();
            body.memory = { thread: threadId, resource: threadId };
            body.requestContext = {
              ...(body.requestContext ?? {}),
              MastraMemory: { thread: { id: threadId }, resourceId: threadId },
            };
            changed = true;
          }

          // 从自定义 header 读取模型 ID，注入 requestContext（Mastra 会合并 body.requestContext）
          const modelId = request.headers.get("x-feedmind-model-id");
          if (modelId) {
            body.requestContext = { ...(body.requestContext ?? {}), feedmindModelId: modelId };
            changed = true;
          }

          if (changed) {
            const headers = new Headers(request.headers);
            headers.delete("content-length");
            request = new Request(request.url, {
              method: request.method,
              headers,
              body: JSON.stringify(body),
              signal: request.signal,
            });
          }
        }
      } catch {
        // 非 JSON body 保持原样透传
      }
    }

    if (webDist) {
      const staticResponse = await tryServeStatic(request, webDist);
      if (staticResponse) return staticResponse;
    }

    return baseFetch(request);
  };

  const server = serve({
    fetch: app.fetch,
    hostname: apiEnv.API_HOST,
    port: apiEnv.API_PORT,
  });

  // 延迟启动后台常驻任务（Ingest Worker、飞书长连接、定时报表调度），
  // 确保 HTTP Server 与 UI 首屏毫秒级就绪，平滑冷启动阶段的 CPU/内存峰值
  setImmediate(() => {
    if (apiEnv.DISABLE_INGEST_WORKER !== "1") {
      startIngestWorker();
    }
    void startLongConnection();
    void startDailyReportScheduler(mastra);
  });

  return server;
}

/** Web 构建产物常见文件的 MIME 映射（覆盖 Vite 输出） */
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".pdf": "application/pdf",
};

function contentType(filePath: string): string {
  return MIME[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

/**
 * 同源提供 Web 构建产物：/api 前缀交给 REST 路由，其余 GET 返回静态文件，
 * 命中 SPA 前端路由的路径回退到 index.html。
 */
async function tryServeStatic(request: Request, webRoot: string): Promise<Response | undefined> {
  const method = request.method;
  if (method !== "GET" && method !== "HEAD") return undefined;

  const url = new URL(request.url);
  if (url.pathname.startsWith("/api")) return undefined;

  let requestPath: string;
  try {
    requestPath = decodeURIComponent(url.pathname).replace(/\\/g, "/");
  } catch {
    // 畸形编码（孤立 %）会抛 URIError：按非法路径处理，避免单个请求打崩 fetch handler
    return undefined;
  }
  if (requestPath.includes("..")) return undefined;

  const filePath = path.join(webRoot, requestPath === "/" ? "index.html" : requestPath);
  const isRealFile = requestPath !== "/" && existsSync(filePath) && statSync(filePath).isFile();

  const target = isRealFile ? filePath : path.join(webRoot, "index.html");
  const stat = statSync(target);
  const nodeStream = createReadStream(target);
  const webStream = Readable.toWeb(nodeStream) as ReadableStream;
  return new Response(webStream, {
    headers: {
      "content-type": isRealFile ? contentType(target) : "text/html; charset=utf-8",
      "content-length": String(stat.size),
    },
  });
}

// 供 Electron 主进程注入惰性隐藏窗口创建/销毁逻辑
export { setMarkedWindowFactory, setMarkedWindowDestroyer } from "@feedmind/crawler-core";

// 退出前等待 OM 后台写库完成（实现在 mastra/index.ts）
export { waitForMemorySettled } from "./mastra/index.js";
