# FeedMind

FeedMind 是一个本地优先的 AI 对话应用，当前已迁移为 pnpm TypeScript monorepo。

## 项目结构

```text
FeedMind/
├── apps/
│   ├── web/      # Next.js 16 + React 19 + assistant-ui
│   ├── api/      # Hono REST API
│   └── agent/    # LangChain.js + LangGraph JS Server
├── packages/
│   ├── contracts # zod/TypeScript 共享契约
│   ├── db        # Drizzle schema 与 migration
│   └── shared    # 环境变量、加密、日期、常量
├── start-dev.ps1
├── start-dev.sh
└── pnpm-workspace.yaml
```

Wiki 业务 API 本阶段不迁移；前端仅保留不请求后端的占位页，后续按单独计划复刻。

## 依赖

- Node.js 24+
- pnpm 11+
- Docker Desktop（用于本地 PostgreSQL + pgvector）

## 环境变量

首次启动前复制模板：

```powershell
Copy-Item .env.example .env
```

长期使用时，请把 `ENCRYPTION_KEY` 设置为固定高强度值。它用于加密模型 API Key，修改后旧密文将无法解密。

## 一键启动

Windows PowerShell：

```powershell
.\start-dev.ps1
```

macOS/Linux：

```bash
./start-dev.sh
```

脚本会启动 PostgreSQL + pgvector，安装依赖，执行 Drizzle migration，并分别启动 Web、API 和 Agent。

启动后访问：

```text
Web:       http://localhost:3000
API:       http://localhost:8000/api/v1/health
Agent API: http://localhost:2024/docs
```

## 常用命令

```powershell
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm db:generate
pnpm db:migrate
```

单独启动：

```powershell
pnpm web:dev
pnpm api:dev
pnpm agent:dev
```
