# FeedMind pnpm Monorepo + TypeScript 迁移计划

## 1. 目标

把当前 `frontend/ + backend/ + agent/` 的三服务结构，迁移为一个基于 `pnpm` 的 TypeScript monorepo，并保持以下能力不退化：

- 前端继续使用 `assistant-ui`，并保持 `@assistant-ui/react-langgraph` 不变。
- 流式输出、工具调用、思考过程输出、thread/checkpoint、interrupt、message metadata 可用。
- Agent 继续通过 LangGraph Server 对外提供协议。
- LangSmith 继续可观测、可追踪、可评估。
- 业务后端迁移到 TS 技术栈。
- Wiki 相关能力本阶段暂不实现，后续基于参考项目单独复刻。

## 2. 结论先行

推荐的目标架构是：

- 包管理与 monorepo：`pnpm`
- 前端：`Next.js 16 + React 19`
- 业务后端：`Hono + TypeScript`
- 数据层：`Drizzle ORM + PostgreSQL`
- Agent：`LangChain.js + LangGraph JS Server`
- 观测：`LangSmith`
- 共享契约：`TypeScript project references + zod`

这条路线与官方文档的匹配关系如下：

- `pnpm` workspace 适合单仓多包管理。
- TypeScript project references 适合把大型项目拆成多个可独立构建的子项目，并通过 `tsc -b` 提升构建与编辑器体验。
- Next.js 官方支持 monorepo 场景下的本地包转译，推荐使用 `transpilePackages`。
- LangGraph JS local server 官方支持从现有项目扫描并注册 `createAgent()` / `StateGraph.compile()` / `workflow.compile()`。
- assistant-ui 的 `react-langgraph` 官方要求 LangGraph API server，并直接暴露 streaming、subgraph events、UI messages、metadata、interrupts、end-to-end cancellation。
- LangSmith 官方支持 LangChain Python 和 JS/TS，也支持 LangGraph 生态。

## 3. 设计原则

1. 以官方文档优先，不引入额外的基础设施复杂度。
2. 以单一事实源为目标：契约、schema、迁移和类型定义尽量集中。
3. 先保住现有用户体验，再做内部实现替换。
4. Wiki 暂不进入迁移范围，避免把计划和参考实现混在一起。
5. monorepo 只做必要分层，不为“未来可能会用到”提前制造包。

## 4. 官方依据摘要

### 4.1 pnpm workspace

pnpm 官方定位就是面向多项目/多包仓库的包管理器。workspace 根目录通过 `pnpm-workspace.yaml` 定义，仓库内包通过 workspace 机制互相链接，适合把前端、API、Agent 和共享包放在同一个仓库里管理。

### 4.2 TypeScript project references

TypeScript 官方推荐用 project references 和 `tsc -b` 来拆分大型代码库。这样做可以：

- 更快的构建
- 更低的内存压力
- 更清晰的模块边界
- 更好的 editor 体验

### 4.3 Next.js monorepo

Next.js 官方文档明确支持 monorepo 中的本地包转译，使用 `transpilePackages` 让 web 应用可以直接消费共享包，而不需要手工拼接构建产物路径。

### 4.4 LangGraph Server

LangGraph JS local server 文档说明：

- 本地开发直接用 `langgraph dev`
- 现有项目可通过 `langgraph config` 扫描 `createAgent()` 等导出
- `langgraph.json` 可以声明 `node_version: "24"` 和 graphs 映射

### 4.5 assistant-ui

assistant-ui 的 `react-langgraph` runtime 直接连接 `@langchain/langgraph-sdk`，要求 LangGraph API server，并保留完整 LangGraph 功能面。

### 4.6 LangSmith

LangSmith 官方支持 LangChain JS/TS，`LANGSMITH_TRACING=true` 配合 `LANGSMITH_API_KEY` / `LANGSMITH_PROJECT` 即可启用 tracing。非 serverless 环境下，官方还建议显式设置 `LANGCHAIN_CALLBACKS_BACKGROUND=true` 来降低延迟。

### 4.7 Drizzle

Drizzle 官方推荐把 TypeScript schema 作为 source of truth，通过 `drizzle-kit generate` 和 `drizzle-kit migrate` 管理迁移。这个模式适合把当前 SQLAlchemy 模型重建成 TS schema。

## 5. 目标项目目录结构

```text
FeedMind/
├── apps/
│   ├── web/
│   │   ├── app/
│   │   ├── components/
│   │   ├── lib/
│   │   ├── public/
│   │   ├── next.config.ts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── vitest.config.ts
│   ├── api/
│   │   ├── src/
│   │   │   ├── app.ts
│   │   │   ├── server.ts
│   │   │   ├── env.ts
│   │   │   ├── lib/
│   │   │   ├── middleware/
│   │   │   ├── modules/
│   │   │   │   ├── chats/
│   │   │   │   ├── health/
│   │   │   │   └── llms/
│   │   │   ├── routes/
│   │   │   │   └── v1/
│   │   │   │       ├── chats.ts
│   │   │   │       ├── health.ts
│   │   │   │       └── llms.ts
│   │   │   └── types/
│   │   ├── test/
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── agent/
│       ├── src/
│       │   ├── agent.ts
│       │   ├── env.ts
│       │   ├── graph.ts
│       │   ├── middleware/
│       │   ├── prompts/
│       │   ├── runtime/
│       │   ├── tools/
│       │   │   ├── index.ts
│       │   │   ├── web-fetch.ts
│       │   │   └── web-search.ts
│       │   └── types/
│       ├── test/
│       ├── langgraph.json
│       ├── package.json
│       └── tsconfig.json
├── packages/
│   ├── contracts/
│   │   ├── src/
│   │   │   ├── agent/
│   │   │   ├── api/
│   │   │   ├── chat/
│   │   │   ├── llm/
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── db/
│   │   ├── drizzle/
│   │   ├── drizzle.config.ts
│   │   ├── src/
│   │   │   ├── client.ts
│   │   │   ├── index.ts
│   │   │   └── schema/
│   │   │       ├── chat.ts
│   │   │       ├── llm.ts
│   │   │       └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── shared/
│       ├── src/
│       │   ├── constants.ts
│       │   ├── crypto/
│       │   ├── date.ts
│       │   ├── env.ts
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
├── docs/
│   └── migration/
│       ├── acceptance-checklist.md
│       ├── api-contracts.md
│       └── monorepo-ts-migration-plan.md
├── .env.example
├── .npmrc
├── eslint.config.mjs
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── prettier.config.mjs
├── README.md
├── start-dev.ps1
├── start-dev.sh
└── tsconfig.base.json
```

### 5.1 目录说明

- `apps/web`：只保留前端应用代码，继续承载 assistant-ui。
- `apps/api`：承载原 `backend/` 的 REST API、业务校验、服务编排。
- `apps/agent`：承载原 `agent/`，并以 LangGraph JS Server 形式运行。
- `packages/contracts`：共享请求/响应/线程/消息/LLM 配置契约。
- `packages/db`：Drizzle schema、数据库 client、迁移入口。
- `packages/shared`：跨应用通用工具，例如加密、日期、错误码、环境变量解析。
- `docs/migration`：迁移过程中的计划、验收与接口文档。
- `start-dev.ps1` / `start-dev.sh`：根目录唯一的本地一键启动入口，负责启动数据库、API、Agent 和 Web。

## 6. 现有目录到目标目录的映射

| 当前路径 | 目标路径 | 处理方式 |
|---|---|---|
| `frontend/` | `apps/web/` | 直接迁移，保留 Next.js 目录风格 |
| `backend/app/api/*` | `apps/api/src/routes/*` | 重新分层，保留 v1 语义 |
| `backend/app/services/*` | `apps/api/src/modules/*` | 拆成领域模块 |
| `backend/app/repositories/*` | `apps/api/src/modules/*/repositories` 或 `packages/db` 上层封装 | 改为 Drizzle 查询层 |
| `backend/app/models/*` | `packages/db/src/schema/*` | 改为 Drizzle schema |
| `backend/app/schemas/*` | `packages/contracts/src/*` | 改为 zod 契约 |
| `backend/app/core/crypto.py` | `packages/shared/src/crypto/*` | 通用加密工具 |
| `backend/app/core/errors.py` | `apps/api/src/lib/errors.ts` | API 错误映射 |
| `backend/app/db/*` | `packages/db/src/*` | 数据库 client 与迁移 |
| `backend/app/tasks/*` | `apps/api/src/modules/*/jobs` | 先保留任务框架，Wiki 相关任务延期 |
| `agent/feedmind/*` | `apps/agent/src/*` | 按 LangGraph JS Server 结构重建 |

## 7. 迁移阶段

### Phase 0. Monorepo 基础设施

目标：

- 建立 `pnpm-workspace.yaml`
- 建立根 `package.json`
- 建立根 `tsconfig.base.json`
- 建立根 `eslint.config.mjs` / `prettier.config.mjs`
- 统一 Node 版本，建议使用 Node 24

任务：

- 把现有 `frontend/`、`backend/`、`agent/` 重命名/迁移到 `apps/` 下。
- 新建 `packages/contracts`、`packages/db`、`packages/shared`。
- 统一根 `package.json` 命令：`dev`、`build`、`lint`、`test`、`typecheck`、`db:*`。
- 用 `workspace:*` 连接内部包。

验收：

- `pnpm install` 只生成一份根锁文件。
- `pnpm -r build` 可以按依赖顺序执行。
- `pnpm --filter @feedmind/web dev`、`@feedmind/api dev`、`@feedmind/agent dev` 可以分别启动。

### Phase 1. 共享契约与数据库层

目标：

- 把请求/响应契约从 Pydantic 转成 zod/TypeScript types。
- 把 SQLAlchemy 模型转成 Drizzle schema。
- 把共享工具从 Python 的 `core` 提取为 TS package。

任务：

- `packages/contracts` 定义：
  - `ApiEnvelope`
  - `ApiError`
  - `ChatSession*`
  - `LLMModel*`
  - `AgentMessage*`
- `packages/db` 定义：
  - `chat_sessions`
  - `chat_messages`
  - `llm`
  - 后续 Wiki 表先不加
- `packages/shared` 定义：
  - 加密与解密
  - 日期工具
  - 环境变量解析
  - 常量与错误码

验收：

- 数据库 schema 可通过 Drizzle 生成迁移。
- 共享契约可被 `apps/web`、`apps/api`、`apps/agent` 同时引用。

### Phase 2. API 迁移

目标：

- 用 Hono 重建 REST API。
- 保持当前前端的 `ApiEnvelope` 协议不变。
- 让前端无需大改就能继续调用 `/api/v1/*`。

任务：

- 迁移健康检查、LLM 配置、聊天快照接口。
- 保留统一错误响应结构。
- 保留模型密钥加密和解密行为。
- 用 Drizzle 替换 ORM 层。
- 用服务模块分离业务逻辑和 HTTP 层。

验收：

- 前端现有的 `apiFetch` 逻辑无需重写。
- `/api/v1/health`、`/api/v1/llms`、`/api/v1/chats` 行为与现状一致。
- 模型配置保存、读取、切换、删除可用。

### Phase 3. Agent 迁移

目标：

- 把 `agent/feedmind/` 改写为 LangChain.js + LangGraph JS Server。
- 保留流式输出、工具调用、思考过程输出、thread、checkpoint、interrupt、LangSmith。

任务：

- 用 `createAgent()` 或等价 LangGraph graph 组织 agent。
- 把 `web_search`、`web_fetch` 迁为 TS tools。
- 把系统提示词、动态日期上下文、工具错误处理迁为 middleware。
- 把当前模型运行时配置读取逻辑迁到 TS。
- 保留 reasoning / thinking 兼容逻辑，确保 assistant-ui 能展示思考块。
- 生成 `langgraph.json`，使用 `node_version: "24"` 和 `graphs` 映射。

验收：

- `@assistant-ui/react-langgraph` 继续能消费线程状态。
- 流式输出继续包含 messages / updates / custom。
- tool call 能在前端展示。
- checkpoint / resume / edit / interrupt 继续可用。
- LangSmith tracing 可见。

### Phase 4. 前端接入与 monorepo 联调

目标：

- `apps/web` 继续保持现有 assistant-ui 体验。
- Monorepo 本地包导入稳定。

任务：

- `next.config.ts` 使用 `transpilePackages` 支持共享包。
- 前端继续使用 `@assistant-ui/react-langgraph`。
- 继续保留 `/api/agent/*` 与 `/api/v1/*` 的代理层。
- 把前端 `lib/*` 里的类型和契约迁到共享包。

验收：

- 聊天页仍能流式输出。
- 历史线程列表、恢复会话、重新生成可用。
- message metadata、reasoning part、tool UI 正常显示。

### Phase 5. 清理与部署

目标：

- 去掉 Python 运行时依赖。
- 保留可复现、可观测的 TS monorepo，并简化本地启动入口。

任务：

- 删除或归档旧的 `frontend/`、`backend/`、`agent/` Python 实现。
- 删除旧 `scripts/` 目录，不再新增 `infra/` 目录。
- 在根目录保留 `start-dev.ps1` / `start-dev.sh`，作为本地启动所有服务的唯一入口。
- 本地启动脚本负责：
  - 确保 `.env` 存在。
  - 启动 PostgreSQL + pgvector 容器。
  - 执行 `pnpm install`。
  - 启动 `apps/api`、`apps/agent`、`apps/web`。
- 补齐 CI 的 build / lint / typecheck / test 流程。

验收：

- 单仓库从零安装可启动全部服务。
- 一次构建可验证全部 package。
- 一次数据库迁移可重建本地开发环境。
- 运行根目录 `start-dev.ps1` 或 `start-dev.sh` 即可启动本地开发环境。

## 8. Root 脚本建议

根 `package.json` 建议至少提供：

- `dev`
- `build`
- `lint`
- `test`
- `typecheck`
- `db:generate`
- `db:migrate`
- `db:reset`
- `web:dev`
- `api:dev`
- `agent:dev`

建议规则：

- `dev` 用 workspace 并行启动 web / api / agent。
- `build` 走 `pnpm -r build`。
- `typecheck` 走 `tsc -b` 或各包等价的 project references 构建。

## 9. 配置建议

### 9.1 `pnpm-workspace.yaml`

建议仅包含：

- `apps/*`
- `packages/*`

### 9.2 `tsconfig`

建议采用：

- 根 `tsconfig.base.json` 作为公共基线
- 每个 package 自己拥有 `tsconfig.json`
- library package 统一开启 `composite: true`
- 通过 project references 串联构建顺序

### 9.3 Next.js

`apps/web/next.config.ts` 需要显式配置 `transpilePackages`，把共享包纳入 Next.js 编译链。

### 9.4 LangGraph

`apps/agent/langgraph.json` 需要显式声明：

- `node_version`
- `graphs`
- `env`

### 9.5 LangSmith

统一环境变量建议：

- `LANGSMITH_TRACING=true`
- `LANGSMITH_API_KEY=...`
- `LANGSMITH_PROJECT=FeedMind`
- 非 serverless 环境可补 `LANGCHAIN_CALLBACKS_BACKGROUND=true`

## 10. 非目标

- 本阶段不实现 Wiki 业务。
- 不在迁移期内引入额外 task runner 或过重的 monorepo 编排框架。
- 不把前端 runtime 从 `react-langgraph` 改成别的 adapter。

## 11. 风险与处理

1. **LangGraph 协议退化风险**
   - 处理：Agent 必须通过 LangGraph JS Server 暴露，不允许降级成普通 Hono stream endpoint。

2. **共享包边界混乱风险**
   - 处理：只保留 `contracts` / `db` / `shared` 这三类共享包，避免过早抽象。

3. **Next.js 本地包转译风险**
   - 处理：统一使用 `transpilePackages`，不要用隐式路径别名跨包导入源码。

4. **Drizzle 迁移漂移风险**
   - 处理：Schema 作为 source of truth，迁移必须可回放。

5. **LangSmith tracing 丢失风险**
   - 处理：把 tracing 环境变量写入默认 `.env.example`，并在本地/CI 同步检查。

## 12. 验收清单

- [ ] 根目录只保留一套 pnpm workspace 与 lockfile
- [ ] `apps/web` 可独立启动
- [ ] `apps/api` 可独立启动
- [ ] `apps/agent` 可独立启动
- [ ] assistant-ui 仍通过 `react-langgraph` 接入
- [ ] 流式输出正常
- [ ] 工具调用正常
- [ ] 思考过程输出正常
- [ ] LangGraph Server 正常
- [ ] LangSmith tracing 正常
- [ ] Drizzle migration 正常
- [ ] API contract 与现有前端兼容
- [ ] Wiki 相关能力仍处于未实现状态，未污染当前迁移
- [ ] 根目录 `start-dev.ps1` / `start-dev.sh` 可启动全部本地服务
- [ ] 仓库不再需要 `infra/` 或 `scripts/` 目录

## 13. 参考资料

- pnpm: https://pnpm.io/
- TypeScript project references: https://www.typescriptlang.org/docs/handbook/project-references.html
- Next.js transpilePackages: https://nextjs.org/docs/pages/api-reference/config/next-config-js/transpilePackages
- LangGraph local server: https://docs.langchain.com/oss/javascript/langgraph/local-server
- LangGraph overview: https://docs.langchain.com/oss/javascript/langgraph
- assistant-ui llms.txt: https://www.assistant-ui.com/llms.txt
- assistant-ui LangGraph runtime: https://www.assistant-ui.com/docs/runtimes/langgraph/overview
- LangSmith tracing for LangChain JS/TS: https://docs.langchain.com/langsmith/trace-with-langchain
- Drizzle schema: https://orm.drizzle.team/docs/sql-schema-declaration
- Drizzle migrations: https://orm.drizzle.team/docs/migrations
