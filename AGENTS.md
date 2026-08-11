# AGENTS.md — FeedMind 项目开发规范

## 项目概述

FeedMind — 知识管理、AI 对话、内容爬取服务平台。pnpm monorepo：api（Hono + Mastra AI Agent + OpenAPI）、web（React 19 + TanStack Router + Tailwind 4 + Base UI）、desktop（Electron 壳，内嵌 API 与 Chromium）；共享包 contracts / db / env / shared / wiki-core / crawler-core。所有用户界面文本与 Wiki 内容使用中文（react-i18next 支持英文）。

## 命令

```bash
pnpm install                   # 安装所有依赖
pnpm run dev                   # 构建共享包后并行启动 api + web
pnpm run desktop:dev           # 构建后启动 desktop（Vite + Electron）
pnpm run desktop               # 生产构建并启动桌面应用
pnpm run build                 # 构建所有包和应用
pnpm run build:packages        # 仅构建共享包
pnpm run typecheck             # 全仓库 TypeScript 类型检查
pnpm run lint                  # 全仓库 ESLint 检查
pnpm run test                  # 运行所有测试（vitest）
pnpm run db:push               # drizzle-kit push 同步 schema（改 schema 后执行）
pnpm run db:init               # 写入种子数据（工具配置、默认运行配置）
pnpm run db:reset              # 重置数据库
pnpm run web:dev               # 仅前端（http://localhost:13790）
pnpm run api:dev               # 仅 API + Mastra Agent（http://localhost:18790）
```

## 关键架构决策

- **OKF 文件型 Wiki**：`wiki/` 是 OKF v0.2 bundle，Concept 为 Markdown + YAML frontmatter，Concept ID 是相对路径去掉 `.md`；`raw/`、`.feedmind/` 为运行时目录，不属于 bundle。v0.2 信号：`generated: { by, at }`（取代 v0.1 `timestamp`）、`sources`（取代 v0.1 `provenance`）、`verified`/`status`/`stale_after` 可选。FTS5 全文索引派生自文件，可随时重建。
- **Mastra Agent**：内嵌于 API 进程（`apps/api/src/mastra/`），经 `@mastra/ai-sdk` 的 `chatRoute()` 暴露 AI SDK v6 流式聊天。Agent 从 `model` 表运行时解析 LLM 模型（`x-feedmind-model-id` 请求头）。聊天接口前端路径 `/api/chat/:agentId` 经 Vite proxy 重写为 `/v1/agent/chat/:agentId`。
- **桌面端 Electron + CDP**：主进程内嵌 API，创建 UI 窗口与两个隐藏标记窗口（`feedmind-crawler`、`feedmind-agent`），经 `--remote-debugging-port`（默认 9333）暴露 CDP；crawler-core 与 Agent 用 Playwright `connectOverCDP` 按标记选页驱动内置 Chromium，连接后校验 UA 含 Electron，拒绝驱动用户主机浏览器。
- **爬虫与 Cookie 认证**：Playwright 驱动，Cookie 存 `cookie_store`，来源为应用内浏览器登录（Electron 打开登录窗口捕获）与微信读书保活（每 30 分钟刷新 skey）。结果入 SQLite，输出 RSS。
- **Wiki 导入管道**（`ingest-pipeline.ts`）：两阶段 LLM——先分析源内容为结构化数据，再生成 OKF Concept 写入 Markdown。
- **消息持久化**：由 Agent Memory（Mastra `mastra.db`）自动处理，web 端不自行存消息。

## 开发规范

### 中文约定

- 代码注释、日志消息、与用户交流均使用中文；日志结构化字段名用英文。
- 注释遵循"说 WHY 不说 WHAT"：只解释设计决策、边界条件、workaround、坑；纯复述代码的注释删除。判断标准：删掉后读者是否仍懂且不丢关键信息。
- 注释中不写 `ponytail:` 前缀，简化的意图直接写进正文。

### 联网调研

实现涉及已有技术栈的功能前，先取最新官方文档（避免内置 `WebSearch`/`WebFetch`，对文档类查询精度不足）：

- 查库/框架技术文档 → **context7**（MCP `query-docs`）
- 网络/网页搜索 → **exa**（`exa:search` / `exa:web_search_exa`）
- 抓取网页内容 → **Firecrawl**（`firecrawl:firecrawl-scrape`）

### Ponytail 原则

用最懒但能用的方案：YAGNI、优先标准库/原生 API、一行能搞定不用五十行、不引入新依赖、不写死路径灵活、不做未来假设。

### 提交规范

- 约定式提交（`feat`/`fix`/`chore`/`docs`/`refactor`/`test`/`style`/`perf`，格式 `type(scope): 中文描述`）。
- husky 自动跑 `lint-staged`（prettier）与 `commitlint`。
- 推送前运行 `pnpm run typecheck && pnpm run lint`。
- **CI 门禁**：push/PR 到 `master` 时 GitHub Actions 自动执行 install → build:packages → typecheck → lint → test；CI 失败即阻塞合并，推送前本地先跑相同序列。

### 分支与版本

- Trunk-based：单人直接提交 `master`；多人协作用短命功能分支（< 2 天）+ PR 合并，不引入 Git Flow 长期分支。
- 分支命名 `type/scope` 前缀（`feat/`、`fix/`、`refactor/` 等），与 commit 类型对齐。
- 共享包与桌面端遵循 SemVer；版本号写入各 `package.json`，禁止无意义 bump。

### 命名规范

- 文件命名 kebab-case（`page-store.ts`、`ingest-worker.ts`）。
- 未使用参数 `_` 前缀（`_signal`、`_category`）。

### 日志与错误处理

- pino 结构化日志，`import { logger } from "../../lib/logger.js"`；数据库包用 `dbLogger`。敏感字段自动脱敏（apiKey、password、cookies、authorization）。主动丢弃 Promise 用 `void`。
- API 业务错误用 `HttpError`（`lib/http.ts`）；重新抛出时传递 `{ cause: err }`；错误日志用结构化字段 `logger.error({ err, taskId }, "描述")`。

### 安全规范

- 信任边界：对外部输入（用户请求、爬虫响应、LLM 输出、RSS/网页）按不可信处理，先做类型/长度校验。
- SSRF 防护：抓取类工具必须校验 URL，拒绝内网/私有 IP 段（参照 `web-fetch.ts` 的 `checkSSRF`）。
- 密钥管理：API Key 等敏感数据 AES 加密落库（`@feedmind/shared`），禁止硬编码、禁止提交 `.env`。

### OpenAPI 文档

所有新路由用 `OpenAPIHono` + `createRoute` 模式；路由定义与 handler 分离，handler 返回类型显式标注。

### 依赖管理

- pnpm@11 + workspace 协议（`workspace:*`）；跨包共享版本经 `pnpm-workspace.yaml` 的 `catalog` 管理。
- 原生依赖经 `allowBuilds` 放行（electron、esbuild 等）；`drizzle-orm`/`@libsql/client` 走 `publicHoistPattern` 供 drizzle-kit 解析。

### 测试

- 集成测试使用内存 SQLite，避免外部依赖。
- 时间/随机相关用 `vi.setSystemTime` 等冻结；每个测试独立，杜绝 flaky。
- 修复必带回归测试；涉及前置状态转换的测试先断言该状态，防止假阳性。

### 实施流程

新功能前：先联网调研涉及技术栈的官方最新文档 → 实现（kebab-case 文件、`import type`、中文 why 注释、捕获异常带 `{ cause }`、路由用 OpenAPI 模式）→ 收尾运行 `pnpm run typecheck && pnpm run lint`。
