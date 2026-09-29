// 优先引入 Zod JIT 编译器，加速运行时模式校验
import "zod/compile";
import { createReadStream, existsSync, statSync } from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";
import { serve, type ServerType } from "@hono/node-server";
export type { ServerType };
import { MastraServer } from "@mastra/hono";
import { initDatabase, initDbPragmas } from "@feedmind/db";
import { LOCAL_RESOURCE_ID } from "@feedmind/contracts";
import { createApp } from "./app.js";
import { apiEnv } from "./env.js";
import { startIngestWorker } from "./modules/wiki/ingest/ingest-worker.js";
import { startScheduler } from "./modules/daily-report/schedule-sync.js";
import { ensureToolConfigs } from "./modules/tools/service.js";
import { setMastra } from "./mastra/holder.js";
import { createMastra } from "./mastra/index.js";
import { feedmindAgent } from "./mastra/agents/feedmind-agent.js";
import { getLatestChatUsage } from "./mastra/utils/chat-usage-tracker.js";
import { startLongConnection } from "./modules/remote-connection/feishu-service.js";

export interface StartApiOptions {
  /** Web 构建产物目录：提供时在 fetch 层提供同源静态资源 + SPA 回退（Electron 生产模式） */
  webDist?: string;
  /** 监听端口覆盖：传 0 由系统分配空闲端口（端口被占用时的回退路径） */
  port?: number;
}

/** 启动完整 API 服务（数据库、后台任务、智能体与 HTTP 服务） */
export async function startApi(options: StartApiOptions = {}): Promise<ServerType> {
  // createApp 内已做 validateApiRuntime；此处仅保证 DB 初始化前 env 已解析
  await initDbPragmas();
  await initDatabase();
  // 工具目录在代码里，启动时补齐缺失的配置行（不覆盖已有配置）
  await ensureToolConfigs();

  const mastra = createMastra();
  setMastra(mastra);
  const app = createApp();

  const mastraServer = new MastraServer({ app, mastra });
  await mastraServer.init();

  const webDist = options.webDist ? path.resolve(options.webDist) : undefined;

  // 自定义 fetch：重写聊天路由请求并提供同源静态资源服务
  const baseFetch = app.fetch.bind(app);
  app.fetch = async (request: Request): Promise<Response> => {
    let url = new URL(request.url);

    // 兼容重写 /api/chat 路径至 Agent 聊天接口
    if (url.pathname.startsWith("/api/chat/")) {
      url.pathname = url.pathname.replace(/^\/api\/chat/, "/v1/agent/chat");
      request = new Request(url, request);
      url = new URL(request.url);
    }

    const isChat = request.method === "POST" && url.pathname.startsWith("/v1/agent/chat/");
    let chatThreadId: string | undefined;
    if (isChat) {
      try {
        const body = (await request.clone().json()) as {
          memory?: { thread?: string; resource?: string };
          requestContext?: Record<string, unknown>;
        };
        if (body && typeof body === "object") {
          let changed = false;

          // 缺少会话标识时自动补齐内存会话上下文
          if (!body.memory?.thread) {
            const threadId = crypto.randomUUID();
            body.memory = { thread: threadId, resource: LOCAL_RESOURCE_ID };
            body.requestContext = {
              ...(body.requestContext ?? {}),
              MastraMemory: { thread: { id: threadId }, resourceId: LOCAL_RESOURCE_ID },
            };
            changed = true;
          }

          chatThreadId = body.memory?.thread;
          body.requestContext = {
            ...(body.requestContext ?? {}),
            threadId: chatThreadId,
          };
          changed = true;

          // 从请求头读取模型标识并注入上下文
          const modelId = request.headers.get("x-feedmind-model-id");
          if (modelId) {
            body.requestContext = { ...(body.requestContext ?? {}), feedmindModelId: modelId };
            changed = true;
          }

          // 从自定义 header 读取工作区上下文并注入
          const wsHeader = request.headers.get("x-feedmind-context");
          if (wsHeader) {
            try {
              const wsCtx = JSON.parse(decodeURIComponent(wsHeader));
              body.requestContext = { ...(body.requestContext ?? {}), workspaceContext: wsCtx };
              changed = true;
            } catch {
              // 解析工作区上下文头部失败时忽略异常
            }
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
        // 请求体解析失败时保持原始请求
      }
    }

    if (webDist) {
      const staticResponse = await tryServeStatic(request, webDist);
      if (staticResponse) return staticResponse;
    }

    const response = await baseFetch(request);

    // 聊天流响应完成后注入真实 Token 用量与缓存数据并异步持久化元数据
    if (isChat && response.status === 200 && response.body && chatThreadId) {
      const threadId = chatThreadId;
      const reader = response.body.getReader();
      const encoder = new TextEncoder();
      const transformedStream = new ReadableStream({
        async start(controller) {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                const usage = getLatestChatUsage(threadId);
                if (usage) {
                  controller.enqueue(
                    encoder.encode(
                      `data: {"type":"data-usage","data":${JSON.stringify(usage)}}\n\n`,
                    ),
                  );
                  void feedmindAgent
                    .getMemory()
                    .then((m) =>
                      m?.updateThread({
                        id: threadId,
                        metadata: { latestUsage: usage },
                      }),
                    )
                    .catch(() => {});
                }
                controller.close();
                break;
              }
              controller.enqueue(value);
            }
          } catch (err) {
            controller.error(err);
          }
        },
        cancel(reason) {
          return reader.cancel(reason);
        },
      });

      return new Response(transformedStream, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }

    return response;
  };

  const server = serve({
    fetch: app.fetch,
    hostname: apiEnv.API_HOST,
    port: options.port ?? apiEnv.API_PORT,
  });

  // 延迟启动后台常驻任务，保证 HTTP 服务优先快速响应
  setImmediate(() => {
    if (apiEnv.DISABLE_INGEST_WORKER !== "1") {
      startIngestWorker();
    }
    void startLongConnection();
    void startScheduler(mastra);
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
    // 解码失败时按非法路径拦截
    return undefined;
  }
  if (requestPath.includes("..")) return undefined;

  const filePath = path.join(webRoot, requestPath === "/" ? "index.html" : requestPath);
  const isRealFile = requestPath !== "/" && existsSync(filePath) && statSync(filePath).isFile();

  const target = isRealFile ? filePath : path.join(webRoot, "index.html");
  const stat = statSync(target);
  const nodeStream = createReadStream(target);
  const webStream = Readable.toWeb(nodeStream) as ReadableStream;
  const headers: Record<string, string> = {
    "content-type": isRealFile ? contentType(target) : "text/html; charset=utf-8",
    "content-length": String(stat.size),
  };

  // HTML 响应注入严格的内容安全策略（CSP）
  if (!isRealFile || target.endsWith(".html")) {
    headers["content-security-policy"] = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "connect-src 'self' ws://127.0.0.1:* http://127.0.0.1:*",
      "font-src 'self' data:",
      "media-src 'self' data: blob:",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");
  }

  return new Response(webStream, { headers });
}

// 供 Electron 主进程注入惰性隐藏窗口创建/销毁逻辑
export { setMarkedWindowFactory, setMarkedWindowDestroyer } from "@feedmind/crawler-core";

// 等待智能体记忆数据持久化完成
export { waitForMemorySettled } from "./mastra/index.js";

// 释放数据库连接与检查点合并
export { shutdownDatabase } from "@feedmind/db";
