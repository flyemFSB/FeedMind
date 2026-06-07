# FeedMind Next.js 到 Vite + TanStack 迁移方案

> 日期：2026-06-07  
> 范围：`apps/web` 前端应用从 Next.js 迁移到 Vite + TanStack Start/Router，并为后续 Electron 打包保留更直接的开发与运行模型。  
> 结论：可行，建议采用 **TanStack Start + TanStack Router + Vite**，TanStack Query 作为第二阶段的服务端状态管理增强。

## 1. 背景与目标

FeedMind 当前是 TypeScript monorepo，核心应用分为：

- `apps/web`：Next.js 前端，承载聊天、Wiki、设置、assistant-ui。
- `apps/api`：Hono 后端服务，提供 `/api/v1/*` 业务 API。
- `apps/agent`：LangGraph Server，提供 Agent streaming runtime，开发端口为 `2024`。
- `packages/*`：contracts、db、crawler-core、wiki-core、shared 等共享包。

当前 `apps/web` 的 Next.js 使用面相对克制，主要承担：

- App Router 页面路由：`/`、`/chat`、`/wiki`。
- 全局 layout、metadata、字体加载和 providers。
- `/api/v1/*` rewrite 到 `BACKEND_API_URL`。
- `/api/agent/*` catch-all route 代理到 LangGraph Server。
- 少量 Next 专属 API：`next/image`、`next/link`、`next/navigation`、`next/font`、`next-themes`、`eslint-config-next`。

由于业务页面几乎都是 `"use client"`，真正的服务端业务能力在 `apps/api` 和 `apps/agent` 中，前端更接近 SPA 壳。迁移到 Vite + TanStack 的主要目标是：

- 降低 Next.js 对 Electron 打包的耦合。
- 使用 Vite 获得更直接的本地开发、热更新和桌面应用集成体验。
- 保留 `/api/v1` 与 `/api/agent` 代理能力，确保 assistant-ui 和 LangGraph streaming 不退化。
- 用 TanStack Router 获得类型安全路由和更明确的客户端路由模型。
- 后续逐步用 TanStack Query 管理 Wiki、设置、会话列表等服务端状态。

## 2. 推荐技术选型

### 2.1 采用 TanStack Start，而不是仅用 TanStack Router

推荐：

```text
Vite
+ TanStack Start
+ TanStack Router
+ React
+ optional TanStack Query
```

原因：

- 只用 Vite + TanStack Router 时，前端会变成纯 SPA，无法自然替代当前 Next API route。
- 当前 `/api/agent/*` 代理需要保留流式响应，不能简单改成浏览器直连 `localhost:2024`，否则会引入 CORS、生产地址暴露、Electron 网络策略差异等问题。
- TanStack Start 提供 server routes，可以替代 Next 的 `app/api/*/route.ts`。
- TanStack Start 基于 Vite，对 Electron dev/prod 加载更友好。

### 2.2 TanStack Query 作为第二阶段引入

TanStack Query 不负责替代 Next.js。它适合替代当前组件中的：

- `useEffect + useState + loading + refreshKey`
- 手写 mutation 后刷新列表
- Wiki 页面、Wiki graph、tools、LLM models、chat sessions 等普通 HTTP 数据请求

不建议第一阶段迁移 chat streaming 时同时大规模引入 TanStack Query。Agent streaming 是最高风险链路，应保持行为最小变化。

## 3. 当前 Next.js 依赖清单

### 3.1 文件级依赖

| 当前文件 | Next.js 依赖 | 迁移方式 |
| --- | --- | --- |
| `apps/web/app/layout.tsx` | `Metadata`、`next/font/google` | 迁移为 `src/routes/__root.tsx`，用 `head()` 管理 metadata，字体改 CSS 或本地字体 |
| `apps/web/app/page.tsx` | `redirect` from `next/navigation` | 迁移为 TanStack route redirect |
| `apps/web/app/chat/page.tsx` | 无直接 Next API，仅 `"use client"` | 迁移为 `src/routes/chat.tsx` |
| `apps/web/app/wiki/page.tsx` | 无直接 Next API，仅 `"use client"` | 迁移为 `src/routes/wiki.tsx` |
| `apps/web/app/api/health/route.ts` | Next route handler | 迁移为 TanStack Start server route |
| `apps/web/app/api/agent/[...path]/route.ts` | Next catch-all route handler | 迁移为 TanStack Start splat server route |
| `apps/web/components/app-shell/sidebar.tsx` | `next/image`、`next/link`、`usePathname`、`useRouter` | 改为 `<img>`、TanStack `Link`、`useRouterState`、`useNavigate` |
| `apps/web/components/assistant-ui/thread-list.tsx` | `usePathname`、`useRouter` | 改为 TanStack Router hooks |
| `apps/web/components/assistant-ui/thread.tsx` | `next/image` | 改为 `<img>` |
| `apps/web/components/assistant-ui/message.tsx` | `next/image` | 改为 `<img>` |
| `apps/web/components/ui/sonner.tsx` | `next-themes` | 改为自建 theme hook 或固定/system theme |
| `apps/web/lib/api/agent.ts` | `NEXT_PUBLIC_*` env | 改为 `VITE_*` 或 TanStack Start public env 约定 |
| `apps/web/eslint.config.mjs` | `eslint-config-next` | 改为通用 React/Vite ESLint |
| `apps/web/tsconfig.json` | `.next/types`、Next plugin | 移除 Next plugin 和 `.next` include/exclude |
| `apps/web/next.config.ts` | rewrite、standalone output | 删除，迁移到 Start server routes 或 Vite config |

### 3.2 保留不变的部分

以下模块不需要因迁移框架而改变业务逻辑：

- `components/assistant-ui/*` 的 assistant-ui 组件结构。
- `lib/api/client.ts` 的统一 envelope 解析和 toast 错误提示。
- `lib/api/wiki.ts`、`llms.ts`、`tools.ts`、`chats.ts` 的 API 封装。
- shadcn/base-ui/lucide/sonner/tailwind 组件体系。
- `apps/api` 和 `apps/agent` 的服务结构。
- workspace packages 的构建关系。

## 4. 目标目录结构

建议迁移后目录如下：

```text
apps/web/
  package.json
  vite.config.ts
  tsconfig.json
  eslint.config.mjs
  postcss.config.mjs
  components.json
  public/
    FeedMind-logo.png
    FeedMind-logo-text.png
    ...
  src/
    routeTree.gen.ts
    router.tsx
    styles/
      globals.css
    routes/
      __root.tsx
      index.tsx
      chat.tsx
      wiki.tsx
      api.health.ts
      api.v1.$.ts
      api.agent.$.ts
  components/
    ...
  lib/
    ...
```

也可以把 `components/` 和 `lib/` 一起移入 `src/`，但为了降低迁移成本，第一阶段建议保留当前 `components/`、`lib/` 位置，只把路由和全局样式迁到 `src/`。

路径别名继续保持：

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

如果后续决定把业务代码全部移入 `src/`，再改为：

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

## 5. 依赖与脚本迁移

### 5.1 移除依赖

从 `apps/web/package.json` 移除：

```json
{
  "dependencies": {
    "next": "16.2.4",
    "next-themes": "^0.4.6"
  },
  "devDependencies": {
    "eslint-config-next": "16.2.4"
  }
}
```

`next-themes` 可暂时保留到 theme 组件替换完成后再移除，但最终应删除。

### 5.2 新增依赖

建议新增：

```json
{
  "dependencies": {
    "@tanstack/react-router": "latest",
    "@tanstack/react-start": "latest"
  },
  "devDependencies": {
    "@tanstack/router-plugin": "latest",
    "@vitejs/plugin-react": "latest",
    "vite": "latest",
    "vite-tsconfig-paths": "latest"
  }
}
```

第二阶段新增：

```json
{
  "dependencies": {
    "@tanstack/react-query": "latest"
  },
  "devDependencies": {
    "@tanstack/react-query-devtools": "latest",
    "@tanstack/react-router-devtools": "latest"
  }
}
```

版本应在执行迁移时通过 `pnpm add` 锁定到当时最新稳定版本，并写入 `pnpm-lock.yaml`。

### 5.3 脚本调整

当前：

```json
{
  "dev": "pnpm --filter @feedmind/contracts build && next dev",
  "build": "node --max-old-space-size=12288 ./node_modules/next/dist/bin/next build",
  "start": "next start"
}
```

迁移后建议：

```json
{
  "dev": "pnpm --filter @feedmind/contracts build && vite dev --host 127.0.0.1 --port 3000",
  "build": "vite build",
  "start": "node .output/server/index.mjs",
  "lint": "eslint .",
  "typecheck": "tsc --noEmit",
  "test": "vitest run --passWithNoTests"
}
```

如果 TanStack Start 当前版本生成的服务端入口路径不同，以实际构建产物为准更新 `start`。

根目录 `package.json` 的 `dev` 脚本可以保持：

```json
{
  "dev": "pnpm build:packages && pnpm --parallel --filter @feedmind/api --filter @feedmind/agent --filter @feedmind/web dev"
}
```

## 6. Vite 与 TanStack Start 配置

新增 `apps/web/vite.config.ts`：

```ts
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 3000,
  },
  plugins: [
    tsconfigPaths(),
    tanstackStart(),
    react(),
  ],
});
```

注意：

- TanStack Start 插件应在 React 插件之前。
- `vite-tsconfig-paths` 用于继续支持 `@/*`。
- 不建议只用 Vite dev proxy 替代 API 代理，因为生产和 Electron 环境也需要同样的 `/api/*` 行为。

## 7. 路由迁移设计

### 7.1 Root route

`apps/web/app/layout.tsx` 迁移为 `apps/web/src/routes/__root.tsx`。

职责：

- 输出 `<html>`、`<head>`、`<body>`。
- 挂载 `HeadContent`、`Scripts`。
- 引入全局 CSS。
- 包裹 `ErrorBoundary`、`TooltipProvider`、`FeedMindRuntimeProvider`、`Toaster`。
- 定义 metadata。

示意：

```tsx
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import { FeedMindRuntimeProvider } from "@/lib/assistant-runtime/provider";
import { ErrorBoundary } from "@/components/app-shell/error-boundary";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "@/app/globals.css";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "FeedMind - AI Research Agent" },
      {
        name: "description",
        content: "Task-driven trend research Agent system",
      },
    ],
  }),
  component: RootDocument,
});

function RootDocument() {
  return (
    <html lang="zh-CN" className="h-full antialiased font-sans">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-full flex flex-col bg-white">
        <ErrorBoundary>
          <TooltipProvider>
            <FeedMindRuntimeProvider>
              <Outlet />
            </FeedMindRuntimeProvider>
          </TooltipProvider>
        </ErrorBoundary>
        <Toaster richColors closeButton position="top-center" />
        <Scripts />
      </body>
    </html>
  );
}
```

`next/font/google` 的 `Geist` 字体变量需要替换为 CSS：

```css
:root {
  --font-sans: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
```

如必须保留 Geist，可使用本地字体文件或 `@fontsource`，但不建议迁移第一阶段引入字体下载复杂度。

### 7.2 Index route

`apps/web/app/page.tsx`：

```tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/chat");
}
```

迁移为 `apps/web/src/routes/index.tsx`：

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/chat" });
  },
});
```

### 7.3 Chat route

`apps/web/app/chat/page.tsx` 迁移为 `apps/web/src/routes/chat.tsx`。

原有 `"use client"` 删除，TanStack/Vite 下 React 组件默认就是客户端组件。

### 7.4 Wiki route

`apps/web/app/wiki/page.tsx` 迁移为 `apps/web/src/routes/wiki.tsx`。

第一阶段不改内部状态逻辑。第二阶段再把 Wiki 数据请求迁移到 TanStack Query。

## 8. API 代理迁移设计

这是迁移成败的关键。

### 8.1 `/api/health`

`apps/web/app/api/health/route.ts` 迁移为 `src/routes/api.health.ts`：

```ts
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => Response.json({ status: "ok" }),
    },
  },
});
```

### 8.2 `/api/v1/*` 后端代理

当前 Next rewrite：

```ts
source: "/api/:path*",
destination: `${backendApiUrl}/api/:path*`
```

迁移后建议明确拆分：

- `/api/v1/*` 代理到 `BACKEND_API_URL`。
- `/api/agent/*` 代理到 `AGENT_API_URL`。
- 不再用一个泛化 `/api/*` fallback，避免误转发 Start 自己的 server routes。

新增 `src/routes/api.v1.$.ts`：

```ts
import { createFileRoute } from "@tanstack/react-router";

const BACKEND_API_URL = process.env.BACKEND_API_URL ?? "http://localhost:8000";

export const Route = createFileRoute("/api/v1/$")({
  server: {
    handlers: {
      GET: proxyToBackend,
      POST: proxyToBackend,
      PUT: proxyToBackend,
      PATCH: proxyToBackend,
      DELETE: proxyToBackend,
      OPTIONS: proxyToBackend,
    },
  },
});

async function proxyToBackend({ request, params }: { request: Request; params: { _splat?: string } }) {
  const requestUrl = new URL(request.url);
  const upstreamUrl = new URL(
    `api/v1/${params._splat ?? ""}`,
    `${BACKEND_API_URL.replace(/\/$/, "")}/`,
  );
  upstreamUrl.search = requestUrl.search;

  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers: request.headers,
    cache: "no-store",
    redirect: "manual",
    signal: request.signal,
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    init.duplex = "half";
  }

  const upstreamResponse = await fetch(upstreamUrl, init);
  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: upstreamResponse.headers,
  });
}
```

实际类型以 TanStack Start 生成的 server route handler 参数为准，迁移时应通过 typecheck 校正。

### 8.3 `/api/agent/*` LangGraph streaming 代理

当前 `apps/web/app/api/agent/[...path]/route.ts` 的行为必须保持：

- 目标为 `AGENT_API_URL`，默认 `http://localhost:2024`。
- 保留 query string。
- 透传 request method 和 headers。
- 非 GET/HEAD 透传 body stream。
- 使用 `duplex: "half"`。
- `redirect: "manual"`。
- response body streaming 原样返回。
- 设置 `Cache-Control: no-cache, no-transform`。

新增 `src/routes/api.agent.$.ts`：

```ts
import { createFileRoute } from "@tanstack/react-router";

const AGENT_API_URL = process.env.AGENT_API_URL ?? "http://localhost:2024";

export const Route = createFileRoute("/api/agent/$")({
  server: {
    handlers: {
      GET: proxyToAgent,
      POST: proxyToAgent,
      PUT: proxyToAgent,
      PATCH: proxyToAgent,
      DELETE: proxyToAgent,
      OPTIONS: proxyToAgent,
    },
  },
});

async function proxyToAgent({ request, params }: { request: Request; params: { _splat?: string } }) {
  const requestUrl = new URL(request.url);
  const upstreamUrl = new URL(
    params._splat ?? "",
    `${AGENT_API_URL.replace(/\/$/, "")}/`,
  );
  upstreamUrl.search = requestUrl.search;

  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers: request.headers,
    cache: "no-store",
    redirect: "manual",
    signal: request.signal,
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    init.duplex = "half";
  }

  const upstreamResponse = await fetch(upstreamUrl, init);
  const headers = new Headers(upstreamResponse.headers);
  headers.set("Cache-Control", "no-cache, no-transform");

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers,
  });
}
```

验收时必须重点测试 assistant-ui 流式输出、tool-call、reasoning parts、会话保存和分支编辑。

## 9. Navigation 与 Image 替换

### 9.1 `next/link`

当前：

```tsx
import Link from "next/link";

<Link href="/wiki">我的WIKI</Link>
```

迁移：

```tsx
import { Link } from "@tanstack/react-router";

<Link to="/wiki">我的WIKI</Link>
```

### 9.2 `useRouter`

当前：

```tsx
const router = useRouter();
router.push("/chat");
```

迁移：

```tsx
import { useNavigate } from "@tanstack/react-router";

const navigate = useNavigate();
navigate({ to: "/chat" });
```

### 9.3 `usePathname`

当前：

```tsx
const pathname = usePathname();
```

迁移：

```tsx
import { useRouterState } from "@tanstack/react-router";

const pathname = useRouterState({
  select: (state) => state.location.pathname,
});
```

### 9.4 `next/image`

当前：

```tsx
import Image from "next/image";

<Image src="/FeedMind-logo.png" alt="FeedMind" width={28} height={28} priority />
```

迁移：

```tsx
<img
  src="/FeedMind-logo.png"
  alt="FeedMind"
  width={28}
  height={28}
  loading="eager"
  decoding="async"
/>
```

由于这些图片来自 `public/` 且尺寸固定，迁移风险很低。

## 10. 环境变量迁移

当前浏览器侧变量：

- `NEXT_PUBLIC_FEEDMIND_ASSISTANT_ID`
- `NEXT_PUBLIC_FEEDMIND_MODEL`

迁移后建议：

- `VITE_FEEDMIND_ASSISTANT_ID`
- `VITE_FEEDMIND_MODEL`

`apps/web/lib/api/agent.ts` 当前：

```ts
export const feedmindAgentAssistantId =
  process.env.NEXT_PUBLIC_FEEDMIND_ASSISTANT_ID ?? "feedmind";

export function getSelectedFeedMindModel(): string {
  return process.env.NEXT_PUBLIC_FEEDMIND_MODEL ?? "";
}
```

迁移后：

```ts
export const feedmindAgentAssistantId =
  import.meta.env.VITE_FEEDMIND_ASSISTANT_ID ?? "feedmind";

export function getSelectedFeedMindModel(): string {
  if (typeof window !== "undefined") {
    const selectedModel = window.localStorage.getItem(selectedModelStorageKey);
    if (selectedModel) return selectedModel;
  }

  return import.meta.env.VITE_FEEDMIND_MODEL ?? "";
}
```

服务端变量保持：

- `BACKEND_API_URL`
- `AGENT_API_URL`

它们只能在 TanStack Start server routes 中通过 `process.env` 读取，不应暴露到浏览器。

## 11. Theme 与 Sonner

当前 `components/ui/sonner.tsx` 使用 `next-themes`：

```ts
import { useTheme } from "next-themes";
```

迁移选项：

### 选项 A：固定 system theme

最小迁移：

```tsx
const Toaster = ({ ...props }: ToasterProps) => {
  return <Sonner theme="system" {...props} />;
};
```

优点：最简单，适合第一阶段。  
缺点：如果未来需要用户切换主题，需要再补主题系统。

### 选项 B：自建轻量 theme store

使用 `zustand` 或 React context 管理 `"light" | "dark" | "system"`，并同步到 `document.documentElement.classList`。

优点：完全摆脱 Next 依赖。  
缺点：迁移第一阶段不是必须。

建议第一阶段采用选项 A。

## 12. Tailwind 与全局样式

当前使用 Tailwind v4、`postcss.config.mjs` 和 `app/globals.css`。

迁移方式：

- 将 `apps/web/app/globals.css` 移到 `apps/web/src/styles/globals.css`。
- 或第一阶段保留原路径，从 root route 引入 `@/app/globals.css`。
- 确认 CSS 中没有依赖 Next 特定路径。
- 保留 `postcss.config.mjs`。

推荐第一阶段保留原路径，减少移动文件造成的 import churn。第二阶段再整理为 `src/styles/globals.css`。

## 13. assistant-ui 适配性

当前 assistant-ui 链路：

```text
FeedMindRuntimeProvider
  -> useLangGraphRuntime
  -> agentStream
  -> unstable_createLangGraphStream
  -> @langchain/langgraph-sdk Client
  -> /api/agent
  -> LangGraph Server
```

迁移后这条链路应保持不变。需要改的只有：

- `agentApiUrl` 的浏览器/服务端 fallback。
- `NEXT_PUBLIC_*` env 改成 `VITE_*`。
- `/api/agent/*` 代理由 Next route handler 改为 TanStack Start server route。

不建议迁移第一阶段修改：

- `FeedMindRuntimeProvider`
- `normalizeReasoning*`
- `filterAgentMetadataEvents`
- `saveChatSessionSnapshot`
- `Thread`、`Message`、`Composer` 的 assistant-ui primitives

这些属于核心交互逻辑，保持不变更利于排查迁移问题。

## 14. TanStack Query 第二阶段方案

第一阶段迁移目标是框架替换成功。第二阶段再引入 TanStack Query。

优先迁移顺序：

1. `listLLMModels`、`getLLMModelRuntime`、selected model。
2. `listTools`、`updateAllToolConfigs`。
3. Wiki spaces、pages、sources。
4. Wiki graph、review、lint。
5. Chat sessions list。

不优先迁移：

- Agent streaming。
- assistant-ui runtime。
- LangGraph stream events。

示例：

```tsx
const spacesQuery = useQuery({
  queryKey: ["wiki", "spaces"],
  queryFn: listWikiSpaces,
});

const createSpaceMutation = useMutation({
  mutationFn: createWikiSpace,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["wiki", "spaces"] });
  },
});
```

收益：

- 减少 `refreshKey`。
- mutation 后刷新更明确。
- loading/error 状态更集中。
- Electron 离线/重试策略未来更好扩展。

## 15. Electron 适配收益

迁移到 Vite + TanStack 后，Electron 开发模式建议：

```text
dev:
  Electron main process
    -> loadURL("http://127.0.0.1:3000")
  Vite dev server
  apps/api dev server
  apps/agent LangGraph dev server

prod:
  Electron main process
    -> start bundled TanStack Start server
    -> loadURL("http://127.0.0.1:<local-port>")
  or
    -> load static/client output if later switched to pure SPA mode
```

对 FeedMind 的优势：

- Vite HMR 更贴近 Electron renderer 开发。
- 不需要处理 Next standalone 的 `.next/standalone` 结构。
- 后续如果 Electron main process 需要接管 `/api/agent` 或 `/api/v1`，Vite/TanStack 的边界更容易拆。
- WebContentsView/内置 Chromium 预览能力可与前端 shell 更自然地组合。

## 16. 分阶段迁移计划

### 阶段 0：准备与基线

目标：建立当前 Next 版本的可验证基线。

任务：

- 运行 `pnpm --filter @feedmind/web typecheck`。
- 运行 `pnpm --filter @feedmind/web lint`。
- 运行 `pnpm --filter @feedmind/web build`。
- 启动完整 dev：`pnpm dev`。
- 手动验证：
  - `/chat` 可打开。
  - 新会话可创建。
  - 模型配置可读取。
  - 发送消息可流式输出。
  - tool-call/reasoning 显示正常。
  - 会话快照可保存。
  - `/wiki` 可打开、空间列表可读取。

### 阶段 1：搭建 TanStack Start 壳

目标：在 `apps/web` 内替换 Next 构建壳，但先不大改业务组件。

任务：

- 更新依赖。
- 新增 `vite.config.ts`。
- 新增 `src/routes/__root.tsx`。
- 新增 `src/routes/index.tsx`、`chat.tsx`、`wiki.tsx`。
- 配置 `router.tsx` 和 `routeTree.gen.ts` 生成。
- 迁移全局 CSS 引入。
- 调整 `tsconfig.json`。
- 调整 `eslint.config.mjs`。

验收：

- `pnpm --filter @feedmind/web dev` 可启动。
- `/` 自动跳转 `/chat`。
- `/chat` UI 渲染正常。
- `/wiki` UI 渲染正常。

### 阶段 2：迁移 Next 专属组件

目标：删除组件中的 Next runtime 依赖。

任务：

- `next/link` -> TanStack `Link`。
- `next/navigation` -> `useNavigate` / `useRouterState`。
- `next/image` -> `<img>`。
- `next-themes` -> 固定 system theme 或自建 theme hook。
- `NEXT_PUBLIC_*` -> `VITE_*`。

验收：

- `rg "next/" apps/web` 无结果。
- `rg "next-themes|NEXT_PUBLIC" apps/web` 无结果。
- sidebar active 状态正常。
- 新会话按钮在非 `/chat` 页面可跳转。
- logo 图片显示正常。

### 阶段 3：迁移 API 代理

目标：替代 Next rewrites 和 route handlers。

任务：

- 新增 `/api/health` server route。
- 新增 `/api/v1/$` server route。
- 新增 `/api/agent/$` server route。
- 删除 `app/api/*`。
- 删除 `next.config.ts`。

验收：

- `GET /api/health` 返回 `{ status: "ok" }`。
- `GET /api/v1/health` 可代理到 `apps/api`。
- `POST /api/agent/threads` 可代理到 LangGraph Server。
- assistant-ui streaming 正常。
- 大消息、tool-call、reasoning、interrupt 不丢失。

### 阶段 4：删除 Next 残留

目标：项目不再依赖 Next。

任务：

- 删除 `apps/web/app` 中已迁移文件。
- 删除 `apps/web/next.config.ts`。
- 删除 `next-env.d.ts`。
- 从 `package.json` 删除 `next`、`eslint-config-next`、`next-themes`。
- 清理 `tsconfig.json` 中 `.next` include/exclude 和 Next plugin。
- 清理 `.next` ignore 配置。
- 更新 lockfile。

验收：

- `rg "next" apps/web/package.json apps/web apps/web/tsconfig.json apps/web/eslint.config.mjs` 只允许业务文本或历史文档中出现。
- `pnpm --filter @feedmind/web typecheck` 通过。
- `pnpm --filter @feedmind/web lint` 通过。
- `pnpm --filter @feedmind/web build` 通过。

### 阶段 5：TanStack Query 增强

目标：优化普通 API 数据流，不触碰 Agent streaming。

任务：

- 在 root route provider 中加入 `QueryClientProvider`。
- 为 Wiki spaces/pages/sources 建立 query hooks。
- 为 LLM models/tools 建立 query hooks。
- mutation 后使用 `invalidateQueries`。
- 引入 Query Devtools，仅 dev 环境启用。

验收：

- Wiki 切换空间、创建空间、导入后列表刷新正常。
- 设置模型 CRUD 正常。
- 工具配置保存后刷新正常。
- chat streaming 未受影响。

### 阶段 6：Electron 集成准备

目标：让前端构建可被 Electron main process 稳定加载。

任务：

- 明确 dev 加载 `http://127.0.0.1:3000`。
- 明确 prod 启动 TanStack Start server 或使用静态输出策略。
- 统一 `BACKEND_API_URL`、`AGENT_API_URL` 的 Electron prod 配置。
- 为 future WebContentsView 预览预留前端通信接口。

验收：

- Electron dev 窗口能加载 TanStack web。
- HMR 正常。
- `/api/v1` 和 `/api/agent` 在 Electron renderer 中同源可访问。

## 17. 回滚策略

建议迁移时创建分支：

```bash
git checkout -b codex/migrate-web-to-tanstack
```

回滚策略：

- 阶段 1-3 未完成前，不删除 Next 版本文件，只新增 TanStack 文件。
- 通过 `package.json` 脚本区分临时入口，例如：

```json
{
  "dev:next": "next dev",
  "dev": "vite dev --host 127.0.0.1 --port 3000"
}
```

- 等 TanStack 版本通过核心验收后，再删除 Next 残留。
- 如果 `/api/agent` streaming 代理不稳定，立即回滚到 Next route handler，不继续迁移组件。

## 18. 风险清单

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| TanStack Start server route 对 streaming 的行为和 Next 有差异 | chat 核心功能异常 | 阶段 3 单独验证 `/api/agent`，不同时做 Query 重构 |
| catch-all splat 参数命名与文档版本差异 | API 代理路径错误 | 以 typecheck 和实际请求日志校正 |
| React 19 + TanStack Start 版本兼容性 | 构建或 hydration 异常 | 迁移时锁定最新版本；如异常，评估降到 React 19 支持明确的版本组合 |
| `next/image` 删除后图片布局细节变化 | logo 尺寸或布局变化 | 固定 width/height/className，手动截图检查 |
| `next/font` 删除后字体变化 | 视觉细节变化 | CSS 使用系统字体栈；如必须保留 Geist，后续本地化字体 |
| 删除 Next rewrites 后 `/api/*` 行为变化 | API 请求失败 | 明确拆分 `/api/v1/$` 和 `/api/agent/$` server route |
| Electron prod 加载 Start server 增加本地端口管理 | 打包复杂度上升 | 后续 Electron 方案中统一端口分配和健康检查 |

## 19. 验收清单

迁移完成后必须满足：

- `pnpm --filter @feedmind/web typecheck` 通过。
- `pnpm --filter @feedmind/web lint` 通过。
- `pnpm --filter @feedmind/web build` 通过。
- `pnpm dev` 可同时启动 packages、api、agent、web。
- `/` 跳转 `/chat`。
- `/chat` 可创建会话、发送消息、流式显示、显示 reasoning/tool-call。
- 会话快照可保存到后端。
- `/wiki` 可加载空间、页面、来源、图谱、review、lint。
- 设置页模型和工具配置可读写。
- `rg "next/|next-themes|NEXT_PUBLIC|next.config|\\.next" apps/web` 无需要保留的结果。
- 浏览器 console 无 hydration/runtime 错误。
- Electron dev 加载 `http://127.0.0.1:3000` 可正常显示前端。

## 20. 最终建议

建议执行路径：

```text
先迁移 TanStack Start 壳
  -> 再迁移 Next API 代理
  -> 再删除 Next 专属组件依赖
  -> 最后引入 TanStack Query
```

不要一开始就把所有 `useEffect` 数据请求改成 Query，也不要同时调整 assistant-ui runtime。FeedMind 的最高价值链路是 Agent streaming，因此第一阶段的迁移原则是：

```text
UI 行为不变
API 路径不变
assistant-ui runtime 不变
只替换框架壳与路由/代理实现
```

在这个约束下，Next.js 完整迁移到 Vite + TanStack 的可行性较高，且能为后续 Electron 打包、内置 Chromium 预览、社媒登录态管理和本地应用体验打下更合适的基础。
