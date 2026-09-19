# AGENTS.md — FeedMind 项目开发规范

## 项目概述

FeedMind 是一个集知识管理、AI 深度研究辅助、内容抓取聚合与多模态自动化于一体的个人工作台。项目采用基于 pnpm 的 Monorepo 架构，全栈由 TypeScript 构建，所有用户交互界面文本与知识库内容默认使用中文（支持 react-i18next 国际化）。

### 架构布局与各模块分工

#### 应用程序（Apps）

- **`apps/desktop`（Electron 桌面壳）**
  - 内嵌 API 服务进程与 Web 静态资源，支持开发期热重载与生产单体打包；
  - 启动 Chromium 专属 CDP 调试端口（默认 `--remote-debugging-port=9333`）；
  - 调度无头/专用标记窗口（`feedmind-crawler` 与 `feedmind-agent`），限制仅在专用标签页内进行自动化，超时自动回收空闲标签页；
  - 集成 Electron `safeStorage` 实现系统级安全凭据加解密，无原生保险箱时降级本地密钥存储；
  - 捕获顶层未捕获异常（`uncaughtException`、`unhandledRejection`）并持久化到本地 `logs/crash.log`。

- **`apps/api`（服务端核心与 Mastra 智能体运行时）**
  - 基于 Hono 框架构建，路由通过 `@hono/node-server` 托管，核心接口支持 `@hono/zod-openapi` 规范与 Scalar 文档；
  - 托管 Mastra AI 运行时环境，通过 `@mastra/ai-sdk` 的 `chatRoute()` 端点对接前端流式对话；
  - 实现 Supervisor 协作网络（`feedmind-agent` 调度 `researcher` / `extractor` / `summarizer` / `browser` 子任务）；
  - 统一记忆系统（Mastra `Memory` + `LibSQLVector`），支持向量语义召回与纯分页降级；
  - 两阶段 OKF 知识库导入流水线（结构化提炼与 Frontmatter/Markdown 正文生成）；
  - 本地 FTS5 全文索引构建与混合相关度评分；
  - 自动化日报系统（选题筛选、网页抓取与提炼、脚本生成、自动化多轮审稿、Edge TTS 语音合成与 Remotion 视频渲染流水线）；
  - 业务模块包含：`chats`、`cookie-cloud`、`crawler`、`daily-report`、`feeds`、`models`、`ops-log`、`remote-connection`、`rss-sources`、`runtime-config`、`skills`、`tools`、`wiki`。

- **`apps/web`（现代化前端交互界面）**
  - 基于 React 19 + TanStack Router + Tailwind 4 + Base UI 构建的现代单页应用；
  - 抽屉式 AI 聊天工作区：支持流式输出、子智能体调用链路展示、上下文动态注入、模型与参数即时切换；
  - OKF 知识库套件：包含 Concept 概念阅读器、Milkdown 所见即所得 Markdown 编辑器、基于 Sigma.js + Graphology 的知识图谱关系网络及社区分析；
  - Feeds / RSS 订阅源中心与内嵌阅读器；
  - 自动化日报卡片与 Remotion 播放器；
  - 模型管理中心、运行参数配置与系统操作审计日志（Ops Log）。

#### 共享包（Packages）

- **`packages/db`**：基于 `@libsql/client` 与 Drizzle ORM 构建的本地 SQLite 数据库基础设施。采用预编译静态 DDL（`schema/ddl.generated.ts`）幂等初始化数据库表结构；启用 WAL 并发日志、NORMAL 同步级别、MMAP 内存映射（64MB）与页缓存限制；维护 Wiki FTS5 虚表及元数据；提供预置种子数据管理。
- **`packages/crawler-core`**：基于 Playwright 的 CDP 自动化采集层。直连桌面内置 Chromium，连接建立前强制断言 Electron User-Agent（杜绝驱动主机外部浏览器）；按标记窗口调度任务；提供微信读书会话保活、小红书等站点的内容采集与 RSS XML 生成。
- **`packages/wiki-core`**：OKF v0.2 标准 Bundle 解析与知识图谱计算引擎。支持 Markdown Frontmatter 解析、多模态文档提取（PDF、OCR 等）、双向链接与反向链接分析、图算法洞察（Louvain 社区发现），以及基于 CJK bigram 的双字符分词与评分算法。
- **`packages/contracts`**：跨端共享的 TypeScript 强类型协议、业务实体与 Zod 校验契约。
- **`packages/env`**：基于 `@t3-oss/env-core` 与 Zod 的强类型环境变量解析与校验层。

---

## 常用开发命令

```bash
pnpm install                   # 安装全仓库依赖（受 catalog 与 allowBuilds 约束）
pnpm run dev                   # 编译共享包并并行启动 API 与 Web 服务
pnpm run desktop:dev           # 构建并启动桌面端开发环境（Vite + Electron）
pnpm run desktop               # 生产构建并启动桌面应用
pnpm run desktop:dist          # 打包生成 Windows 生产安装包（NSIS）
pnpm run build                 # 构建所有共享包与应用
pnpm run build:packages        # 仅构建共享包
pnpm run typecheck             # 全仓库 TypeScript 严格类型检查
pnpm run lint                  # 全仓库 oxlint 代码规范检查
pnpm run fmt                   # 全仓库 oxfmt 代码格式化（直接写入）
pnpm run fmt:check             # 全仓库 oxfmt 格式校验（不写入，门禁检查）
pnpm run test                  # 执行全仓库 Vitest 测试套件（全项目一次性运行）
pnpm run test:coverage         # 执行测试并输出覆盖率报告（本地分析使用）
pnpm run db:init               # 写入数据库默认种子数据（模型列表、工具配置等）
pnpm run db:reset              # 重置本地 SQLite 数据库
pnpm run db:push               # 通过 drizzle-kit 同步修改到数据库 schema
pnpm run web:dev               # 独立启动前端服务（http://localhost:13790）
pnpm run api:dev               # 独立启动 API 与 Mastra 进程（http://localhost:18790）
```

---

## 关键架构决策

- **OKF 文件型知识库（v0.2 规范）**：`wiki/` 为标准的 OKF bundle 目录，每个 Concept 均为包含 Markdown 正文与 YAML Frontmatter 的独立文件，Concept ID 是其相对于 bundle 根目录去除 `.md` 后的路径；`raw/` 与 `.feedmind/` 为本地运行时目录，不纳入 bundle 管理。FTS5 全文索引作为派生数据维护在 SQLite 中，支持随时幂等重建。
- **Mastra 智能体运行时**：Agent 运行时内嵌于 API 服务进程，通过 `@mastra/ai-sdk` 的 `chatRoute()` 对接前端。模型在运行时由 `x-feedmind-model-id` 请求头动态解析；提示词结构保证静态段在前以命中 Anthropic 缓存断点，思考模型（如 DeepSeek V4/Reasoner）自动过滤不支持的 temperature 与 topP 参数。
- **桌面端 Chromium 隔离与安全断言**：主进程内嵌 API 服务并开启专属 CDP 端口（默认 9333），管理带标记的专属页面（`feedmind-crawler` 与 `feedmind-agent`）。自动化逻辑建立连接后必须校验 UA 包含 Electron，禁止接管或操作用户操作系统中的个人浏览器。
- **两阶段知识导入流水线**：文档与网页导入采用两阶段大模型处理机制：阶段一进行结构化提炼（抽取概念、实体关系、核心摘要与分类），阶段二转换为符合 OKF 规范的 Markdown 正文与 Frontmatter 元数据并写入文件系统。
- **单体 SQLite 性能与事务优化**：本地 `feedmind.db` 统一启用 WAL 并发模式、NORMAL 同步级别与 64MB 内存映射；应用退出前统一触发 `PRAGMA wal_checkpoint(TRUNCATE)` 截断日志；表结构采用预编译静态 DDL 初始化，彻底消除运行时迁移解析耗时。
- **Monorepo 依赖与边界隔离**：`apps` 可以依赖 `packages`，`packages` 严禁反向依赖 `apps`；跨包引用一律使用 `@feedmind/*` 组织命名，严禁任何相对路径穿透。抽包决策必须基于“保护真实的运行时、安全、领域或跨端契约边界”，而非单纯为了代码复用。

---

## 注释与日志规范（第一性原理核心准则）

### 1. 注释原则

- **纯粹基于项目现状描述**：注释必须基于当前代码的真实逻辑与设计现状进行描述，严禁提及或记录无意义的过程决策（如“历史原因”、“曾有 Bug”、“原本打算”、“取代/废弃了旧版”、“兼容迁移前旧数据”等）。任何过时或在当前实际情况下无意义的决策说明必须坚决删除。
- **言简意赅，每处单行**：代码注释做到言简意赅，原则上每处注释提纯为单行（1 行即可），杜绝冗长铺垫与大段叙事。
- **说 WHY 不说 WHAT**：注释仅解释设计意图、特殊边界条件、平台兼容 workaround 与关键坑点，严禁机械翻译或单纯复述代码做了什么。若删去该注释后读者依然能轻易读懂且不丢失关键边界信息，该注释即为多余，必须删除。
- **中文表述习惯**：所有代码注释、日志提示文案、用户界面文本与交流均使用自然规范的中文；严禁在注释中添加 `ponytail:` 等任何前缀标签。
- **特定语法合规单行注释**：在因平台或运行环境预期可以安全忽略异常的空 `catch` 块中，必须保留简洁有意义的单行中文说明（例如 `// 忽略检查点异常`），以满足代码规范检查（避免 `eslint(no-empty)` 报错）。

### 2. 日志与异常处理

- **统一结构化日志**：使用 pino 记录结构化日志（API 层使用 `logger`，数据库层使用 `dbLogger`）。日志提示文案使用中文，结构化字段名保持英文。
- **安全脱敏**：严禁在日志中输出敏感信息，系统自动脱敏 `apiKey`、`password`、`cookies`、`authorization` 等字段。
- **标准异常封装**：API 业务错误统一采用 `HttpError`；捕获未知底层错误并重新抛出时，必须传递 `{ cause: err }` 保留调用栈；记录错误日志时统一使用结构化传参：`logger.error({ err, ...extra }, "中文业务描述")`。
- **异步 Promise 处理**：主动忽略或不等待返回结果的 Promise 必须显式标记 `void`。

---

## 工程规范与安全守则

### 1. 安全防御规范

- **零信任输入校验**：所有外部输入（HTTP 请求参数、爬虫抓取内容、LLM 输出的 JSON、RSS XML）均按不可信数据处理，必须通过 Zod Schema 进行严格的结构与类型校验。
- **SSRF 深度防御**：抓取工具与外部请求在发起前必须严格执行 SSRF 拦截（如 `checkSSRF` 校验），坚决拒绝访问私有局域网、链路本地地址与回环 IP。
- **敏感数据加密落库**：API Key 等敏感凭据在入库前必须经过 AES 加密处理；桌面端通过 Electron SafeStorage 保护主密钥；严禁在代码中硬编码秘钥，严禁提交任何 `.env` 文件。

### 2. 代码编写规范

- **文件命名**：一律采用 kebab-case 格式（如 `source-store.ts`、`ingest-pipeline.ts`）。
- **模块导入与类型隔离**：遵循 `verbatimModuleSyntax: true` 规范，纯类型导入强制使用 `import type`。
- **未使用参数占位**：未使用但因接口签名必须保留的参数统一添加 `_` 前缀（如 `_signal`、`_context`），对齐 oxlint 规则。
- **极简实现（Ponytail 原则）**：追求最短有效 diff；严禁引入未经明确请求的抽象层与脚手架；优先利用语言原生特性、标准库及项目中现有的成熟工具与依赖。

### 3. API 路由规范

- **内部路由**：采用标准 `Hono` 结合 `jsonOk` / `jsonError` 响应助手。
- **核心开放接口**：涉及跨应用契约或导出 API 规范的路由，采用 `OpenAPIHono` + `createRoute` 模式。

### 4. 测试与验证要求

- **环境解耦与防 Flaky**：单元测试与集成测试统一运行于内存或临时 SQLite 数据库，测试用例之间完全独立隔离；时间或随机数相关逻辑必须通过 `vi.setSystemTime` 等进行冻结。
- **回归覆盖**：所有缺陷修复均须附带针对性的回归测试，并断言具体的前置状态与修复效果。
- **提交流水线与门禁检查**：
  - 推送代码前必须在本地确保以下四项全部通过：
    1. `pnpm run fmt:check`（oxfmt 格式化无差异）
    2. `pnpm run typecheck`（TypeScript 严格编译检查 0 错误）
    3. `pnpm run lint`（oxlint 代码检查 0 error 0 warning）
    4. `pnpm test`（Vitest 全仓库单元与集成测试 100% 通过）
