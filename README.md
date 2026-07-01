<div align="center">
  <img src="./apps/web/public/FeedMind-logo-text.png" alt="FeedMind" width="360" />
  <p><strong>本地优先的趋势研究 Agent 系统</strong></p>
  <p>
    <img src="https://img.shields.io/badge/node-%3E%3D24.0.0-brightgreen" alt="Node" />
    <img src="https://img.shields.io/badge/TypeScript-strict-blue" alt="TypeScript" />
    <img src="https://img.shields.io/badge/license-MIT-green" alt="License" />
    <img src="https://img.shields.io/badge/pnpm-11-orange" alt="pnpm" />
  </p>
  <p>
    <a href="#-项目简介">项目简介</a> •
    <a href="#-功能特性">功能特性</a> •
    <a href="#-快速开始">快速开始</a> •
    <a href="#-项目结构">项目结构</a> •
    <a href="#-API-文档">API 文档</a> •
    <a href="#-开发规范">开发规范</a>
  </p>
</div>

---

## 📖 项目简介

FeedMind 是一个**本地优先**的任务驱动趋势研究 Agent 系统，完成从「网络信息收集 → AI 深度对话 → 结构化知识库沉淀」的完整闭环。

```
信息收集 (Crawler) → AI 研究 (Agent) → 知识库 (Wiki)
```

所有数据保留在本地（SQLite + 文件系统），API 密钥加密存储，不依赖任何云服务。适合知识工作者在研究会话中深度使用。

支持中文/English 双语界面和浅色/深色/跟随系统三种主题模式。

---

## ✨ 功能特性

### AI 对话（Mastra Agent）

- **多模型支持** — OpenAI、Anthropic、DeepSeek、Gemini、Grok、Qwen 及所有 OpenAI 兼容接口，模型从 LLM 表运行时解析
- **流式响应** — 基于 Mastra AI SDK 的实时流式输出，支持推理 token 渲染和工具调用可视化
- **工具调用** — 内置网络搜索（Tavily/Exa/AnySearch 级联降级）、网页抓取（Firecrawl/Readability）、Wiki 查询、意图澄清等工具
- **动态 subagent** — 通过 task 工具运行时创建 researcher / extractor / summarizer / browser 子 agent
- **会话管理** — 持久化对话历史，支持分支切换和模型热切换

### Wiki 知识库

- **文件存储** — 页面为纯 Markdown 文件 + YAML frontmatter，存储在磁盘上，可 git 追踪
- **Spaces** — 多个独立知识库，按目录组织，数据库仅存储聊天和爬虫数据
- **交叉引用** — `[[wikilink]]` 语法，自动反向链接解析
- **知识图谱** — graphology 驱动的图形化展示 + Louvain 社区检测
- **CJK 全文搜索** — 中文分词支持
- **来源管理** — 附加 URL 或上传文件（PDF、DOCX、图片）作为页面来源
- **AI 导入流水线** — 两阶段 LLM 流水线：分析源内容 → 生成结构化 Wiki 页面
- **检查与审核** — 内置链接检查器和 AI 驱动的质量审核

### 内容爬虫引擎

- **路由驱动架构** — 每个平台/功能注册独立 route handler，类似 RSSHub 模式
- **多平台** — 小红书（笔记/收藏/搜索）、B站（视频/搜索）、知乎（回答/热榜/文章/想法/搜索）、抖音、快手
- **双路径策略** — 有 cookie 时走 HTTP 直调，无 cookie 或反爬降级时自动切换 Playwright 浏览器自动化
- **Cookie 注入** — 浏览器降级路径自动注入登录态，支持有状态爬取
- **RSS 输出** — 所有爬取结果统一输出 RSS 2.0 XML，含封面图、分类标签、附件等结构化字段
- **任务管理** — 任务队列、进度跟踪、取消、重试，同路由互斥

### 资讯管理

- **RSS 订阅** — 订阅源聚合展示（支持 feedsmith 等标准 RSS 解析）
- **社交媒体动态** — 关注博主内容流、收藏内容查看
- **AI 推荐** — 基于兴趣的内容推荐
- **一键 Cookie 同步** — Chrome Extension 自动读取登录态，无需手动复制粘贴

### 隐私与安全

- **本地优先** — 所有数据保留在本地 SQLite + 文件系统，不依赖云服务
- **加密 API 密钥** — AES-128-CBC + HMAC-SHA256 (Fernet 兼容)
- **日志脱敏** — pino redact 自动过滤 `apiKey`、`password`、`cookies`、`authorization` 等敏感字段
- **SSRF 防护** — 网页抓取 URL 校验，防止服务端请求伪造

---

## 🚀 快速开始

### 前置要求

- **Node.js** >= 24.0.0
- **pnpm** >= 10.0.0（安装：`npm install -g pnpm`）

### 安装

```bash
# 克隆仓库
git clone https://github.com/flyemFSB/FeedMind.git
cd FeedMind

# 复制环境变量
cp .env.example .env
# 编辑 .env — 设置 ENCRYPTION_KEY（用于 API 密钥加密）

# 安装依赖
pnpm install

# 构建共享包
pnpm run build:packages

# 初始化 SQLite 数据库
pnpm run db:init
```

### 开发

```bash
# 启动所有服务（API + Web）
pnpm run dev
```

| 服务              | 地址                                  |
| ----------------- | ------------------------------------- |
| Web 前端          | http://localhost:13790                |
| REST API          | http://localhost:18790                |
| API 文档 (Scalar) | http://localhost:18790/api/v1/docs    |
| OpenAPI JSON      | http://localhost:18790/api/v1/openapi |

### 常用命令

| 命令                      | 说明                          |
| ------------------------- | ----------------------------- |
| `pnpm install`            | 安装所有依赖                  |
| `pnpm run dev`            | 启动所有开发服务（API + Web） |
| `pnpm run build`          | 构建所有应用和包              |
| `pnpm run build:packages` | 仅构建共享包                  |
| `pnpm run typecheck`      | TypeScript 类型检查           |
| `pnpm run lint`           | ESLint 代码检查               |
| `pnpm run test`           | 运行测试（Vitest）            |
| `pnpm run db:init`        | 初始化 SQLite 数据库          |
| `pnpm run db:generate`    | 生成 Drizzle 迁移文件         |
| `pnpm run db:migrate`     | 运行 Drizzle 迁移             |

---

## 📁 项目结构

```
feedmind/
├── apps/
│   ├── web/                          # TanStack Start 前端（React 19）
│   │   ├── src/routes/               # 路由定义（/wiki、/feeds、/chat）
│   │   ├── components/               # UI 组件
│   │   │   ├── app-shell/            # 全局壳层（侧边栏、顶栏、Agent 抽屉）
│   │   │   ├── ai-elements/          # AI 对话组件（消息气泡、工具调用）
│   │   │   ├── chat/                 # 聊天会话（线程列表、编辑器）
│   │   │   ├── wiki/                 # Wiki 阅读器、编辑器、图谱、导入
│   │   │   ├── feeds/                # 资讯管理（RSS、社交媒体、AI 推荐）
│   │   │   ├── settings/             # 设置面板（模型、工具、运行时、技能）
│   │   │   ├── remote-connection/    # 远程连接弹窗（飞书、社交平台）
│   │   │   └── ui/                   # shadcn/ui 基础组件
│   │   └── lib/                      # API 客户端、自定义 hooks、i18n
│   │
│   ├── api/                          # Hono REST API + Mastra Agent
│   │   ├── src/
│   │   │   ├── lib/                  # 通用工具（logger、openapi、http、错误类）
│   │   │   ├── routes/v1/            # OpenAPI 路由组（health、chats、llms、
│   │   │   │                         #   wiki、crawler、tools、skills、
│   │   │   │                         #   runtime-config、remote-connection）
│   │   │   ├── modules/              # 业务逻辑服务
│   │   │   │   ├── wiki/             # 空间管理、页面存储、导入管道、图谱
│   │   │   │   ├── crawler/          # 爬虫任务管理 + RSS 输出
│   │   │   │   ├── chats/            # 会话持久化
│   │   │   │   ├── llms/             # 模型 CRUD + 选中
│   │   │   │   ├── remote-connection/# 平台连接与 Cookie 管理
│   │   │   │   └── models/           # 运行时配置
│   │   │   └── mastra/               # Agent 定义、工具、subagent 模板
│   │   │       ├── agents/           # feedmind-agent 主 Agent
│   │   │       ├── tools/            # 搜索、网页抓取、Wiki、Task 工具
│   │   │       └── subagents/        # 内置 subagent 模板
│   │   └── src/server.ts             # 入口文件
│   │
├── packages/
│   ├── contracts/                    # Zod 校验 schema（前后端共享契约）
│   ├── db/                           # Drizzle ORM schema + 迁移 + 客户端
│   ├── shared/                       # 环境变量、Fernet 加密、日期工具
│   ├── crawler-core/                 # 路由驱动爬虫引擎
│   │   ├── src/
│   │   │   ├── core/                 # 浏览器管理、RSS 构建器、路由注册、
│   │   │   │                         #   签名算法（WBI、x-zse-96）
│   │   │   └── routes/               # 平台 handlers（小红书、B站、知乎、
│   │   │                             #   抖音、快手）
│   └── wiki-core/                    # Wiki 文件系统、frontmatter、wikilink、图谱
│
├── data/
│   ├── feedmind.db                   # SQLite 数据库
│   └── wiki/                         # Wiki Markdown 文件
│
├── docs/                             # 设计文档、架构决策、方案设计
├── .husky/                           # Git hooks（commitlint + lint-staged）
├── .editorconfig                     # 编辑器配置
├── .gitattributes                    # Git 属性配置
├── .prettierignore                   # Prettier 忽略规则
├── commitlint.config.mjs             # 提交信息规范
├── prettier.config.mjs               # 代码格式化配置
├── tsconfig.base.json                # TypeScript 基础配置
└── pnpm-workspace.yaml               # pnpm 工作空间配置
```

---

## 🧱 架构设计

### 系统架构

```
                    浏览器
                       │
              ┌────────┴────────┐
              │                 │
         /api/v1/*        /api/agent/*
              │                 │
              ▼                 ▼
    ┌─────────────────────────────────┐
    │  apps/api (Hono + Mastra)       │
    │  ┌───────────────────────────┐  │
    │  │ REST 路由                  │  │
    │  │ LLMs / Chats / Wiki /     │  │
    │  │ Crawler / Tools / Skills   │  │
    │  │ RemoteConnection / Health  │  │
    │  ├───────────────────────────┤  │
    │  │ Mastra Agent              │  │
    │  │ feedmind-agent + tools    │  │
    │  └──────────┬────────────────┘  │
    └─────────────┼───────────────────┘
                  │
       ┌──────────┴──────────┐
       │                     │
    SQLite (libSQL)     File System
    ┌──────────────┐   data/wiki/*.md
    │ chats        │
    │ llms         │
    │ runtime_conf │
    │ crawler_tasks│
    │ remote_conn  │
    └──────────────┘
```

### 爬虫引擎架构

```
┌─ 路由驱动 ──────────────────────────────────────┐
│                                                   │
│  registerRoute("xhs/user/notes", handler)         │
│  registerRoute("bili/user/video", handler)        │
│  registerRoute("zh/hot", handler)                 │
│  ...                                              │
│                                                   │
├─ 双路径策略 ──────────────────────────────────────┤
│                                                   │
│  RouteHandler({ params, cookies, signal })        │
│       │                                           │
│       ├─ 有 cookie → HTTP 直调用 API              │
│       │   biliFetch() / zhihuFetch() / fetch()    │
│       │                                           │
│       └─ 无 cookie 或错误 → Playwright 兜底       │
│           injectCookies(page, cookies, domain)     │
│           page.goto() → 拦截 XHR / evaluate()     │
│                                                   │
├─ 输出 ────────────────────────────────────────────┤
│                                                   │
│  buildRssXml({ title, link, items })             │
│  → RSS 2.0 XML（含 image、category、enclosure）   │
│                                                   │
└───────────────────────────────────────────────────┘
```

### Cookie 获取与同步

```
Chrome Extension (MV3)
  chrome.cookies.getAll({ domain })  →  POST localhost:18790
       │
       ▼
remoteConnections 表（SQLite）
       │
       ▼ 爬虫任务时读取
injectCookies(page, cookies, domain)
       │
       ▼
Playwright 无头浏览器 → 已登录 → 爬取平台内容
```

### 技术栈

| 层级       | 技术                                                    |
| ---------- | ------------------------------------------------------- |
| 前端框架   | TanStack Start (Vite) + TanStack Router                 |
| UI         | React 19、Tailwind CSS 4、motion、shadcn/ui             |
| 国际化     | react-i18next + i18next-browser-languagedetector        |
| 主题       | next-themes（浅色/深色/系统）                           |
| 后端 API   | Hono 4 + @hono/zod-openapi + Scalar UI                  |
| Agent 框架 | Mastra (`@mastra/core`)                                 |
| AI SDK     | Vercel AI SDK (`ai`, `@ai-sdk/react`, `@ai-sdk/openai`) |
| ORM        | Drizzle ORM                                             |
| 数据库     | libSQL（嵌入式 SQLite）                                 |
| 校验       | Zod 4（契约优先设计）                                   |
| 爬虫       | 自研路由引擎 + @mastra/agent-browser (Playwright)       |
| 搜索       | Tavily、Exa、AnySearch（级联降级）                      |
| 网页抓取   | Firecrawl、Mozilla Readability、cheerio                 |
| 知识图谱   | graphology + Louvain 社区检测                           |
| 加密       | Fernet (AES-128-CBC + HMAC-SHA256)                      |
| 日志       | pino 结构化日志 + 自动脱敏                              |
| 测试       | Vitest                                                  |
| 代码检查   | ESLint + Prettier + commitlint                          |
| Monorepo   | pnpm workspaces + Turborepo                             |
| 运行环境   | Node.js >= 24                                           |

---

## 📋 API 文档

API 采用 OpenAPI 3.1 规范，通过 `@hono/zod-openapi` 自动生成文档：

- **交互式文档**: 启动服务后访问 `http://localhost:18790/api/v1/docs`（Scalar UI）
- **OpenAPI JSON**: `http://localhost:18790/api/v1/openapi`

### 路由概览

| 分组               | 路径                            | 说明                          |
| ------------------ | ------------------------------- | ----------------------------- |
| Health             | `GET /health`                   | 健康检查（含数据库连接状态）  |
| LLMs               | `/llms`                         | 模型 CRUD + 选中              |
| Chats              | `/chats`                        | 会话 CRUD + 消息持久化        |
| Runtime            | `/runtime-configs`              | 运行时配置（会话/Wiki 模型）  |
| Tools              | `/tools`                        | 工具配置 CRUD                 |
| Wiki               | `/wiki/spaces/:id/*`            | 空间、页面、来源、导入、图谱  |
| Crawler            | `/crawler/tasks`                | 爬虫任务创建、列表、取消、RSS |
| Remote Connections | `/remote-connections`           | 社交平台连接与 Cookie 管理    |
| Skills             | `/skills`                       | 技能包安装、管理              |
| Agent Chat         | `POST /api/agent/chat/:agentId` | AI 流式对话（Vite dev proxy） |

### 环境变量

| 变量                    | 必需   | 默认值               | 说明                                                             |
| ----------------------- | ------ | -------------------- | ---------------------------------------------------------------- |
| `ENCRYPTION_KEY`        | **是** | —                    | AES 加密密钥，用于加密 LLM API 密钥。`openssl rand -hex 32` 生成 |
| `DATABASE_PATH`         | 否     | `./data/feedmind.db` | SQLite 数据库文件路径                                            |
| `APP_ENV`               | 否     | `development`        | 运行环境（`production` 时强制校验加密密钥）                      |
| `API_HOST`              | 否     | `127.0.0.1`          | API 监听地址（Docker 部署设为 `0.0.0.0`）                        |
| `API_PORT`              | 否     | `18790`              | API 监听端口                                                     |
| `WIKI_DIR`              | 否     | `data/wiki`          | Wiki Markdown 文件存储目录                                       |
| `DISABLE_INGEST_WORKER` | 否     | —                    | 设为 `1` 禁用 Wiki 导入 worker                                   |

---

## 📐 开发规范

### 实施规范

1. **Ponytail 原则** — 用最懒但能用的方案。YAGNI，不引入不需要的依赖，不搞过度工程
2. **动手前先调研** — 涉及技术栈功能时先查最新官方文档，确保实现基于最新版本
3. **中文注释** — 代码注释用中文，说 WHY 不说 WHAT
4. **中文日志** — 日志消息用中文，结构化字段用英文

### 提交规范

遵循 Conventional Commits，格式 `type(scope): 描述`：

```
feat(crawler): 添加小红书笔记详情路由
fix(api): 修复健康检查超时问题
chore(deps): 升级 pino 到 v10
docs(readme): 更新 API 文档链接
refactor(ingest): 提取公共解析逻辑
test(contracts): 补充 Zod schema 测试
style(eslint): 启用 no-floating-promises 规则
perf(worker): 优化缓存策略
```

- 提交前自动运行 `lint-staged`（prettier 格式化）
- 提交信息自动由 `commitlint` 校验
- 推送前运行 `pnpm run typecheck && pnpm run lint`

### 代码规范

| 规则                                 | 约定                                                     |
| ------------------------------------ | -------------------------------------------------------- |
| **文件命名**                         | kebab-case（`page-store.ts`）                            |
| **变量/函数**                        | camelCase                                                |
| **类/类型/接口**                     | PascalCase                                               |
| **未使用参数**                       | `_` 前缀（`_signal`、`_category`）                       |
| **ESLint `no-explicit-any`**         | warn，避免随意使用 any                                   |
| **ESLint `consistent-type-imports`** | error，强制 `import type`                                |
| **ESLint `no-floating-promises`**    | error，禁止未处理的 Promise                              |
| **TypeScript**                       | `strict: true` + `noUnusedLocals` + `noUnusedParameters` |
| **错误处理**                         | 重新抛出时传递 `{ cause: err }`                          |
| **主动丢弃 Promise**                 | 使用 `void` 操作符                                       |

### 共享包

| 包                       | 说明                                                           |
| ------------------------ | -------------------------------------------------------------- |
| `@feedmind/contracts`    | Zod 4 校验 schema 和 TypeScript 类型（前后端共享的唯一契约源） |
| `@feedmind/db`           | Drizzle ORM schema、SQLite 客户端、迁移和种子数据              |
| `@feedmind/shared`       | 环境变量加载器、日期工具、Fernet 加密                          |
| `@feedmind/crawler-core` | 路由驱动爬虫引擎（浏览器管理、签名算法、RSS 构建、平台实现）   |
| `@feedmind/wiki-core`    | Wiki 文件系统操作、frontmatter 解析、wikilink、图谱            |

---

## 📄 许可证

[MIT](./LICENSE)

---

<div align="center">
  <p>Built with React 19, TanStack Start, Hono, Mastra</p>
  <p>本地 · 安静 · 编辑式</p>
</div>
