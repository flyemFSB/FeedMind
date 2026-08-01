# CLAUDE.md — FeedMind 项目开发规范

## 项目概述

FeedMind — 知识管理、AI 对话、内容爬取服务平台。基于 pnpm monorepo 架构，包含两个应用和五个共享包。

## 技术栈

```
apps/
  api/    Hono REST API + Mastra AI Agent + OpenAPI (Scalar)
  web/    Vite SPA + React 19 + TanStack Router + Tailwind CSS 4 + Base UI
packages/
  contracts/    Zod 4 schemas + TypeScript 类型（API 契约单一数据源）
  db/           Drizzle ORM 表定义 + SQLite (libsql)
  shared/       Crypto (AES 加密/解密) + 环境变量 + 工具函数
  wiki-core/    OKF v0.1 文件系统操作（frontmatter、Markdown links、graph）
  crawler-core/ 多平台内容爬虫引擎（小红书、抖音、B 站等）
data/
  wiki/         Wiki 空间（Markdown 文件，不在仓库中）
```

## 关键架构决策

- **OKF 文件型 Wiki**：每个空间的 `wiki/` 是 OKF v0.1 bundle，Concept 使用 Markdown + YAML frontmatter，Concept ID 是相对路径去掉 `.md`。`raw/` 和 `.feedmind/` 是 FeedMind 运行时目录，不属于 bundle。数据库存储聊天/爬虫数据，以及 wiki 页面的 FTS5 全文检索索引（派生自文件，可随时重建）。
- **中文优先**：所有用户界面文本和 Wiki 内容使用中文。通过 react-i18next 支持英文。
- **Mastra Agent**：AI Agent 内嵌于 API 进程 (`apps/api/src/mastra/`)，使用 `@mastra/core`。通过 `@mastra/ai-sdk` 的 `chatRoute()` 暴露 AI SDK v6 兼容的流式聊天接口。
- **动态模型解析**：Agent 从 `model` 表运行时解析 LLM 模型，通过 `x-feedmind-model-id` 请求头读取用户选中的模型（服务端包装 app.fetch 注入 requestContext）。
- **Wiki 导入管道** (`ingest-pipeline.ts`)：两阶段 LLM 管道——阶段一分析源内容为结构化数据，阶段二生成 OKF Concept JSON 并写入 Markdown 文件。
- **运行时配置** (`runtime_config` 表)：存储每个运行时（"session" 聊天、"wiki" 导入）的 LLM 参数。
- **爬虫**：基于 Playwright，使用 Cookie 认证，结果存入 SQLite。
- **OpenAPI 文档**：通过 `@hono/zod-openapi` 自动生成 OpenAPI 3.1 规范，Scalar UI 提供交互式文档页面。

## 命令

```bash
pnpm install                   # 安装所有依赖
pnpm run dev                   # 并行启动所有开发服务
pnpm run build                 # 构建所有包和应用
pnpm run build:packages        # 仅构建共享包
pnpm run typecheck             # 全仓库 TypeScript 类型检查
pnpm run lint                  # 全仓库 ESLint 检查
pnpm run test                  # 运行所有测试（vitest）
pnpm run db:push               # 用 drizzle-kit push 同步 schema 到数据库（开发期每次改 schema 后执行）
pnpm run db:init               # 写入种子数据（工具配置、默认运行配置，首次使用或重置后执行）
pnpm run web:dev               # 仅前端（http://localhost:13790）
pnpm run api:dev               # 仅 API + Mastra Agent（http://localhost:18790）
```

## API 路由

所有路由位于 `/api/v1` 下：

| 路由              | 功能                                                     |
| ----------------- | -------------------------------------------------------- |
| `GET /health`     | 健康检查（含数据库连接状态）                             |
| `LLMs`            | 模型 CRUD + 选中                                         |
| `runtime-configs` | 运行时配置读写                                           |
| `chats`           | 聊天会话 CRUD                                            |
| `tools`           | 工具配置 CRUD                                            |
| `wiki/*`          | Wiki 空间/页面/源/导入/图谱/审查/lint                    |
| `crawler/*`       | 爬虫任务和结果                                           |
| `openapi`         | OpenAPI 3.1 JSON 规范（由 `@hono/zod-openapi` 自动生成） |
| `docs`            | Scalar 交互式 API 文档 UI                                |

Agent 聊天路由：`/api/chat/:agentId`（前端）→ Vite dev proxy 重写为 `/v1/agent/chat/:agentId`（后端）。

## 开发规范

### 实施规范

1. **动手前先联网调研**：当实现涉及已有技术栈的功能时，必须先通过联网搜索（WebSearch / MCP Context7）获取相关库/框架/工具的最新官方文档、API 变更、推荐实践，确保实现方案基于最新版本。
2. **Ponytail 原则**：用最懒但能用的方案。YAGNI——不做不需要的功能；优先用标准库/原生 API，不引入新依赖；一行能搞定不用五十行。不搞过度工程、不写死路径灵活、不做未来假设。
3. **中文注释**：所有代码注释使用中文。遵循"注释说 WHY 不说 WHAT"原则——代码本身应自文档化，注释解释设计决策、边界条件、workaround 原因。
4. **中文日志**：所有日志消息使用中文，结构化字段名使用英文。
5. **中文回复**：与用户的交流、思考过程展示、代码评审等全部使用中文。
6. **注释中不写 `ponytail:`**：简化的意图直接写在注释正文中，不需要加 `ponytail:` 前缀标记。
7. **每次回答前调用 ponytail plugin**：通过 Skill 工具调用 `ponytail:ponytail` 技能，确保 Ponytail 原则在每个回答中生效。

### 提交规范

- **约定式提交**：遵循 Conventional Commits 规范
  ```
  feat(scope): 添加用户登录功能
  fix(api): 修复健康检查超时问题
  chore(deps): 升级 pino 到 v10
  docs(readme): 更新 API 文档链接
  refactor(ingest): 提取公共解析逻辑
  test(contracts): 补充 Zod schema 测试
  style(eslint): 启用 no-floating-promises 规则
  perf(worker): 优化缓存策略
  ```
- **husky pre-commit**：自动运行 `lint-staged`（prettier 格式化）
- **husky commit-msg**：自动运行 `commitlint` 校验提交信息格式
- **推送前**：运行 `pnpm run typecheck && pnpm run lint` 确保无错误

### 代码格式化 (Prettier + EditorConfig)

- `printWidth: 100`，2 空格缩进
- 尾逗号（trailing comma），LF 换行
- `.editorconfig` 统一跨 IDE 行为
- `.gitattributes` 确保跨平台换行符一致

### ESLint 规则

| 规则                        | 级别  | 说明                      |
| --------------------------- | ----- | ------------------------- |
| `no-explicit-any`           | warn  | 避免随意使用 any          |
| `no-unused-vars`            | warn  | `_` 前缀豁免              |
| `consistent-type-imports`   | error | 强制 `import type`        |
| `no-floating-promises`      | error | 禁止未处理的 Promise      |
| `no-misused-promises`       | error | 禁止 Promise 误用         |
| `await-thenable`            | error | 确保 await 仅用于 Promise |
| `prefer-nullish-coalescing` | warn  | 鼓励 `??` 替代 `\|\|`     |
| `prefer-optional-chain`     | warn  | 鼓励 `?.` 替代 `&&`       |

API 和 Web 子包启用了 `parserOptions.projectService: true` 支持类型感知检查。

### TypeScript 严格度

- `strict: true` + `noUnusedLocals: true` + `noUnusedParameters: true`
- `target: ES2023` + `module: NodeNext`，支持 `import type` 语法
- `declarationMap: true`，方便 IDE 导航到源码

### 命名规范

- **文件命名**：kebab-case（`page-store.ts`、`ingest-worker.ts`）
- **变量/函数**：camelCase
- **类/类型/接口**：PascalCase
- **未使用参数**：`_` 前缀（`_signal`、`_category`）

### 日志规范

- 使用 `pino` 结构化日志，通过 `import { logger } from "../../lib/logger.js"` 引用
- 级别映射：`fatal`（进程退出）→ `error`（需人工关注）→ `warn`（可恢复降级）→ `info`（正常事件）
- 敏感字段自动脱敏（`apiKey`、`password`、`cookies`、`authorization`）
- 数据库包使用 `dbLogger`（`packages/db/src/logger.ts`）
- 主动丢弃 Promise 时使用 `void` 操作符

### 错误处理

- API 层业务错误使用 `HttpError`（`lib/http.ts`）
- 重新抛出捕获的异常时传递 `{ cause: err }`（符合 `preserve-caught-error` 规则）
- 错误日志使用结构化字段：`logger.error({ err, taskId }, "描述")`

### OpenAPI 文档

- 使用 `@hono/zod-openapi` 定义带文档的路由：`createRoute()` → `openapiApp.openapi()`
- 路由定义和 handler 分离，handler 中返回类型需要显式标注
- 所有新路由优先使用 `OpenAPIHono` + `createRoute` 模式

### 目录结构约定

```
apps/api/src/
  lib/          通用工具（http、logger、openapi）
  routes/v1/    Hono 路由定义 + OpenAPI 注册
  modules/      业务逻辑服务（按模块分包）
  mastra/       Mastra Agent 定义（agents、tools、prompts、subagents）
packages/
  contracts/    Zod schema + TypeScript types（契约单一数据源）
  shared/       纯工具函数、加密、常量
  db/           数据库 schema + 客户端初始化
  wiki-core/    Wiki 文件系统引擎
  crawler-core/ 爬虫引擎（core + platforms）
```

### 依赖管理

- 使用 `pnpm@11` + workspace 协议（`workspace:*`）
- 跨包共享依赖版本通过 `pnpm-workspace.yaml` 的 catalog 管理
- 依赖更新通过 `.github/dependabot.yml` 自动化（如已配置）

### 测试策略

- 使用 `vitest` 作为测试框架
- 测试文件放在源文件同级：`*.test.ts`
- 编写测试优先覆盖 `packages/contracts` 的 Zod schema 验证
- 集成测试使用内存 SQLite，避免外部依赖

### 实施检查清单

实现新功能前依次确认：

1. [ ] 联网调研涉及的技术栈官方最新文档
2. [ ] 遵循 kebab-case 文件命名
3. [ ] 为公开 API 添加 JSDoc 说明
4. [ ] 添加中文 "why" 注释（而非 "what" 注释）
5. [ ] 使用中文日志消息 + 结构化字段
6. [ ] 正确使用日志级别（error/warn/info）
7. [ ] 捕获异常时传递 `{ cause: err }`
8. [ ] 使用 `import type` 分离类型导入
9. [ ] 路由优先使用 `@hono/zod-openapi` 模式
10. [ ] 运行 `pnpm run typecheck && pnpm run lint` 确保无错误
