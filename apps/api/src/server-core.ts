import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ServerType } from "@hono/node-server";
import { serve } from "@hono/node-server";
import { MastraServer } from "@mastra/hono";
import { initDatabase } from "@feedmind/db";
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

  await initDatabase();

  if (apiEnv.DISABLE_INGEST_WORKER !== "1") {
    startIngestWorker();
  }

  initToolConfig();

  // 飞书 WebSocket 长连接（无需公网 IP，飞书服务器主动推送事件）
  await startLongConnection();

  const mastra = createMastra();
  setMastra(mastra);
  const app = createApp();

  const mastraServer = new MastraServer({ app, mastra });
  await mastraServer.init();

  // 日报定时调度：Mastra schedules 承担触发，schedule_tasks 记账/UI 由同步层镜像
  await startDailyReportScheduler(mastra);

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

  return serve({
    fetch: app.fetch,
    hostname: apiEnv.API_HOST,
    port: apiEnv.API_PORT,
  });
}

// ─── 桌面应用桥 ───────────────────────────────────────────────
// Electron 主进程通过 @feedmind/api/server-core 引用，注册应用内登录、惰性隐藏窗口与启动保活
export { setLoginHandler, getLoginHandler } from "./modules/cookiecloud/bridge.js";
export { setMarkedWindowFactory, setMarkedWindowDestroyer } from "@feedmind/crawler-core";
export { startKeepAlive } from "./modules/cookiecloud/keepalive.js";

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
  const content = await readFile(target);
  return new Response(content, {
    headers: {
      "content-type": isRealFile ? contentType(target) : "text/html; charset=utf-8",
    },
  });
}
