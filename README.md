<div align="center">
  <img src="./apps/web/public/FeedMind-logo-text.png" alt="FeedMind" width="360" />
  <p><strong>本地优先的 AI 研究助手与知识管理系统</strong></p>
  <p>
    <img src="https://img.shields.io/badge/node-%3E%3D24.0.0-brightgreen" alt="Node" />
    <img src="https://img.shields.io/badge/TypeScript-strict-blue" alt="TypeScript" />
    <img src="https://img.shields.io/badge/license-MIT-green" alt="License" />
    <img src="https://img.shields.io/badge/pnpm-11-orange" alt="pnpm" />
  </p>
  <p>
    <a href="#项目简介">项目简介</a> •
    <a href="#功能特性">功能特性</a> •
    <a href="#快速开始">快速开始</a> •
    <a href="#项目结构">项目结构</a> •
    <a href="#架构设计">架构设计</a> •
    <a href="#api-文档">API 文档</a> •
    <a href="#开发规范">开发规范</a>
  </p>
</div>

---

## 项目简介

FeedMind 是一个**本地优先**的任务驱动趋势研究 Agent 系统。它完成从「网络信息收集 → AI 深度对话讨论 → 结构化知识库沉淀」的完整闭环。所有数据保留在本地（SQLite + 文件系统），API 密钥加密存储，无需云依赖。

```
信息收集 (Crawler) → AI 研究 (Chat) → 知识库 (Wiki)
```

支持中文/English 双语界面和浅色/深色/跟随系统三种主题模式。

---

## 功能特性

### AI 对话（Mastra Agent）

- **多模型支持** — OpenAI、Anthropic、DeepSeek、Gemini、Grok、Qwen 及所有 OpenAI 兼容接口
- **流式响应** — 基于 Mastra AI SDK 的实时流式输出，支持推理 token 渲染
- **工具调用** — 内置网络搜索、网页抓取、Wiki 查询、意图澄清等工具
- **动态 subagent** — 通过 task 工具运行时创建 researcher / extractor / summarizer / browser 子 agent
- **会话管理** — 持久化对话历史，支持分支切换

### Wiki 知识库

- **文件存储** — 页面为纯 Markdown 文件 + YAML frontmatter，存储在磁盘上，可 git 追踪
- **Spaces** — 多个独立知识库，按目录组织
- **交叉引用** — `[[wikilink]]` 语法，自动反向链接解析
- **知识图谱** — 图形化展示 + Louvain 社区检测
- **CJK 全文搜索** — 中文分词支持
- **来源管理** — 附加 URL 或上传文件（PDF、DOCX、图片）作为页面来源
- **AI 导入流水线** — 两阶段 LLM 流水线：分析源内容 → 生成结构化页面
- **检查与审核** — 内置链接检查器和 AI 驱动的质量审核

### 内容爬虫

- **多平台** — 小红书、抖音、B站、微博、知乎、快手、贴吧
- **可插拔架构** — Template Method 模式，通过单类添加新平台
- **Cookie 认证** — 基于任务的爬取，带进度跟踪
- **丰富结果** — 结构化内容、创作者信息、互动数据持久化到 SQLite

### 隐私与安全

- **本地优先** — 所有数据保留在本地（SQLite + 文件系统）
- **加密 API 密钥** — Fernet 兼容 AES-128-CBC + HMAC-SHA256
- **SSRF 安全代理** — 防止服务端请求伪造
- **日志脱敏** — pino redact 自动过滤 `apiKey`、`password`、`cookies` 等敏感字段

---

## 快速开始

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

| 服务              | 地址                                 |
| ----------------- | ------------------------------------ |
| Web 前端          | http://localhost:3000                |
| REST API          | http://localhost:8000                |
| API 文档 (Scalar) | http://localhost:8000/api/v1/docs    |
| OpenAPI JSON      | http://localhost:8000/api/v1/openapi |

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
| `pnpm run db:migrate`     | 运行 Drizzle 迁移             |

---

## 项目结构

```
feedmind/
├── apps/
│   ├── web/                          # TanStack Start 前端（React 19）
│   │   ├── src/routes/               # 路由定义
│   │   ├── components/               # UI 组件（ai-elements、chat、wiki、settings）
│   │   │   ├── ai-elements/          # AI 对话组件
│   │   │   ├── chat/                 # 聊天会话组件
│   │   │   ├── wiki/                 # Wiki 阅读器、编辑器、图谱
│   │   │   ├── settings/             # 设置面板
│   │   │   └── ui/                   # shadcn/ui 基础组件
│   │   └── lib/                      # API 客户端、hooks、i18n
│   │
│   ├── api/                          # Hono REST API + Mastra Agent
│   │   ├── src/
│   │   │   ├── lib/                  # 通用工具（logger、openapi、http）
│   │   │   ├── routes/v1/            # 路由组
│   │   │   ├── modules/              # 业务逻辑服务
│   │   │   │   ├── wiki/             # Wiki 空间、页面、导入管道、图谱
│   │   │   │   ├── crawler/          # 爬虫任务管理
│   │   │   │   ├── chats/            # 会话持久化
│   │   │   │   ├── llms/             # 模型管理
│   │   │   │   ├── models/           # 运行时配置
│   │   │   │   └── tools/            # 工具配置
│   │   │   └── mastra/               # Agent 定义、工具、提示词
│   │   │       ├── agents/           # Agent 定义
│   │   │       ├── tools/            # 工具实现
│   │   │       └── subagents/        # 子 agent 模板
│   │   └── src/server.ts             # 入口文件
│   │
├── packages/
│   ├── contracts/                    # Zod 校验 schema（前后端共享）
│   ├── db/                           # Drizzle schema + 迁移 + 种子数据
│   ├── shared/                       # 环境配置、Fernet 加密、工具函数
│   ├── crawler-core/                 # 抽象爬虫基类、工厂、平台实现
│   └── wiki-core/                    # Wiki 文件系统、frontmatter、wikilink、图谱
│
├── data/
│   ├── feedmind.db                   # SQLite 数据库
│   └── wiki/                         # Wiki Markdown 文件
│
├── docs/                             # 设计文档与迁移记录
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

## 架构设计

### 系统架构图

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
    │  │ LLM / Chat / Wiki /       │  │
    │  │ Crawler / Tools / OpenAPI  │  │
    │  ├───────────────────────────┤  │
    │  │ Mastra Agent              │  │
    │  │ feedmind-agent + tools    │  │
    │  └──────────┬────────────────┘  │
    └─────────────┼──────────────────-┘
                  │
       ┌──────────┴──────────┐
       │                     │
    SQLite (libSQL)     File System
    ┌──────────────┐   data/wiki/*.md
    │ chats        │
    │ llms         │
    │ runtime_conf │
    │ crawler_*    │
    └──────────────┘
```

### 技术栈

| 层级       | 技术                                                    |
| ---------- | ------------------------------------------------------- |
| 前端框架   | TanStack Start (Vite) + TanStack Router                 |
| UI         | React 19、Tailwind CSS 4、shadcn/ui、ai-elements        |
| 国际化     | react-i18next + i18next-browser-languagedetector        |
| 主题       | next-themes（浅色/深色/系统）                           |
| 后端 API   | Hono 4                                                  |
| Agent 框架 | Mastra (`@mastra/core`)                                 |
| AI SDK     | Vercel AI SDK (`ai`, `@ai-sdk/react`, `@ai-sdk/openai`) |
| ORM        | Drizzle ORM                                             |
| 数据库     | libSQL/Turso（嵌入式 SQLite）                           |
| 校验       | Zod 4（契约优先设计）                                   |
| 爬虫       | 自定义多平台引擎（Playwright）                          |
| 搜索       | Tavily、Exa、AnySearch（级联降级）                      |
| 网页抓取   | Firecrawl、Mozilla Readability、JSDOM                   |
| 知识图谱   | graphology + Louvain 社区检测                           |
| 加密       | Fernet (AES-128-CBC + HMAC-SHA256)                      |
| API 文档   | @hono/zod-openapi + Scalar UI                           |
| 日志       | pino 结构化日志                                         |
| 测试       | Vitest                                                  |
| 代码检查   | ESLint + Prettier                                       |
| Monorepo   | pnpm workspaces                                         |
| 运行环境   | Node.js >= 24                                           |

---

## API 文档

API 采用 OpenAPI 3.1 规范，通过 `@hono/zod-openapi` 自动生成文档：

- **交互式文档**: 启动服务后访问 `http://localhost:8000/api/v1/docs`（Scalar UI）
- **OpenAPI JSON**: `http://localhost:8000/api/v1/openapi`

### 路由概览

| 分组    | 路径                            | 说明                           |
| ------- | ------------------------------- | ------------------------------ |
| Health  | `GET /health`                   | 健康检查                       |
| LLMs    | `/llms`                         | 模型 CRUD + 选中               |
| Chats   | `/chats`                        | 会话 CRUD + 消息持久化         |
| Tools   | `/tools`                        | 工具配置 CRUD                  |
| Runtime | `/runtime-configs`              | 运行时配置读写                 |
| Wiki    | `/wiki/spaces/:id/*`            | 空间、页面、来源、导入、图谱   |
| Crawler | `/crawler/*`                    | 任务创建、内容列表、创作者信息 |
| Agent   | `POST /api/agent/chat/feedmind` | AI 流式对话                    |

### 环境变量

| 变量                | 必需        | 默认值                  | 说明                                      |
| ------------------- | ----------- | ----------------------- | ----------------------------------------- |
| `ENCRYPTION_KEY`    | 是          | `feedmind`（开发）      | 用于加密 LLM API 密钥                     |
| `OPENAI_API_KEY`    | 按需        | —                       | OpenAI 兼容 API 密钥                      |
| `ANTHROPIC_API_KEY` | Claude 模型 | —                       | Anthropic API 密钥                        |
| `TAVILY_API_KEY`    | 网页搜索    | —                       | Tavily 搜索 API 密钥                      |
| `BACKEND_API_URL`   | 否          | `http://localhost:8000` | 后端 API 地址                             |
| `APP_ENV`           | 否          | `development`           | 环境模式（production 时强制校验加密密钥） |

---

## 开发规范

### 提交规范

遵循 Conventional Commits 规范，提交信息格式为 `type(scope): 描述`：

- `feat` — 新功能
- `fix` — 修复
- `chore` — 杂项（构建、依赖）
- `docs` — 文档
- `refactor` — 重构
- `test` — 测试
- `style` — 代码格式
- `perf` — 性能优化

提交前自动运行 `lint-staged`（prettier 格式化 + eslint 修复），提交信息自动由 `commitlint` 校验。

### 代码规范

- **文件命名**: kebab-case（如 `page-store.ts`）
- **注释**: 中文，说 WHY 不说 WHAT
- **日志**: pino 结构化日志，中文消息 + 英文结构字段
- **ESLint** 强制规则：`consistent-type-imports`、`no-floating-promises`、`no-misused-promises`、`await-thenable`
- **TypeScript**: `strict: true` + `noUnusedLocals` + `noUnusedParameters`
- **错误处理**: 重新抛出异常时传递 `{ cause: err }`

### 共享包

| 包                       | 说明                                                         |
| ------------------------ | ------------------------------------------------------------ |
| `@feedmind/contracts`    | Zod 校验 schema 和 TypeScript 类型（前后端共享的唯一契约源） |
| `@feedmind/db`           | Drizzle ORM schema、SQLite 客户端、迁移和种子数据            |
| `@feedmind/shared`       | 环境变量加载器、日期工具、Fernet 加密                        |
| `@feedmind/crawler-core` | 抽象爬虫基类、工厂和平台实现                                 |
| `@feedmind/wiki-core`    | Wiki 文件系统操作、frontmatter 解析、wikilink、图谱          |

---

## 许可证

[MIT](./LICENSE)

---

<div align="center">
  <p>Built with React 19, TanStack, Hono, Mastra</p>
</div>
