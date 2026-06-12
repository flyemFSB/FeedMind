<div align="center">
  <img src="./apps/web/public/FeedMind-logo-text.png" alt="FeedMind" width="360" />
  <p><strong>Local-first AI research agent with knowledge management.</strong></p>
  <p>
    <img src="https://img.shields.io/badge/node-%3E%3D24.0.0-brightgreen" alt="Node" />
    <img src="https://img.shields.io/badge/pnpm-%3E%3D11.0.0-orange" alt="pnpm" />
    <img src="https://img.shields.io/badge/TypeScript-strict-blue" alt="TypeScript" />
    <img src="https://img.shields.io/badge/license-MIT-green" alt="License" />
  </p>
  <p>
    <a href="#overview">Overview</a> •
    <a href="#features">Features</a> •
    <a href="#architecture">Architecture</a> •
    <a href="#getting-started">Getting Started</a> •
    <a href="#project-structure">Structure</a> •
    <a href="#configuration">Configuration</a>
  </p>
</div>

---

## 👋 Overview <a name="overview"></a>

FeedMind 是一个**本地优先**的任务驱动趋势研究 Agent 系统。它完成从「网络信息收集 → AI 深度对话讨论 → 结构化知识库沉淀」的完整闭环。所有数据保留在本地（SQLite + 文件系统），API 密钥加密存储，无需云依赖。

```
信息收集 (Crawler) → AI 研究 (Chat) → 知识库 (Wiki)
```

支持多种语言界面（中文/English）和白天/黑夜双主题模式。

---

## ✨ Features <a name="features"></a>

<details open>
<summary><strong>🤖 AI Chat (Mastra Agent)</summary>

- **多模型支持** — OpenAI、Anthropic、DeepSeek、Gemini、Grok、Qwen 及所有 OpenAI 兼容接口
- **流式响应** — 基于 Mastra AI SDK 的实时流式输出
- **工具调用** — 内置工具：web search、web fetch、Wiki search/read、ask clarification
- **推理展示** — 原生渲染思考/推理 token（DeepSeek R1、Claude extended thinking 等）
- **会话管理** — 持久化对话历史
</details>

<details open>
<summary><strong>📚 Wiki 知识库</strong></summary>

- **文件存储** — 页面为纯 Markdown 文件 + YAML frontmatter，存储在磁盘上，可 git 追踪
- **Spaces** — 多个独立知识库，按目录组织
- **交叉引用** — `[[wikilink]]` 语法，自动反向链接解析
- **知识图谱** — 图形化展示 + Louvain 社区检测
- **全文搜索** — CJK 分词支持
- **来源管理** — 附加 URL 或上传文件（PDF、DOCX、图片）作为页面来源
- **AI 导入流水线** — 两阶段 LLM 流水线：分析源内容 → 生成结构化页面
- **检查与审核** — 内置链接检查器和 AI 驱动的质量审核

</details>

<details open>
<summary><strong>🔍 内容爬虫</strong></summary>

- **多平台** — 小红书、抖音、B站、微博、知乎、快手、贴吧
- **可插拔架构** — Template Method 模式；通过单类添加新平台
- **Cookie 认证** — 基于任务的爬取，带进度跟踪
- **丰富结果** — 结构化内容、创作者信息、互动数据持久化到 SQLite

</details>

<details open>
<summary><strong>🔐 隐私与安全</strong></summary>

- **本地优先** — 所有数据保留在本地（SQLite + 文件系统）
- **加密 API 密钥** — Fernet 兼容 AES-128-CBC + HMAC-SHA256
- **SSRF 安全代理** — 防止服务端请求伪造
- **无云依赖** — 完全离线可用
</details>

<details open>
<summary><strong>🌐 国际化 & 主题</strong></summary>

- **双语界面** — 中文 / English，通过 `react-i18next` 实现，支持浏览器语言自动检测
- **白天/黑夜双模式** — 通过 `next-themes` 实现，支持跟随系统、浅色、深色三种模式
</details>

---

## 🏗️ Architecture <a name="architecture"></a>

```
┌──────────────────────────────────────────────────────────────────┐
│                        BROWSER                                    │
├──────────────────────────────────────────────────────────────────┤
│  apps/web (TanStack Start + React 19 + Tailwind CSS 4)           │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │  路由: /chat, /wiki, /                                     │   │
│  │  UI: ai-elements + shadcn/ui (base-nova)                    │   │
│  │  国际化: react-i18next (中/英)                              │   │
│  │  主题: next-themes (浅色/深色/系统)                         │   │
│  │  状态管理: TanStack Query + Zustand                          │   │
│  └────────────────────────────────────────────────────────────┘   │
│         │                                             │            │
│         │ /api/v1/*                                   │ /api/agent/*│
│         ▼                                             ▼            │
├─────────┬──────────────────────────────────────────────┬────────────┤
│  apps/api (Hono + Mastra)   :8000                      │            │
│  ┌──────────────────────────────────────────────┐      │            │
│  │  REST 路由:                                    │      │            │
│  │  ├─ /health                                   │      │            │
│  │  ├─ /llms                                     │      │            │
│  │  ├─ /chats                                    │      │            │
│  │  ├─ /tools                                    │      │            │
│  │  ├─ /runtime-configs                          │      │            │
│  │  ├─ /wiki/*                                   │      │            │
│  │  └─ /crawler/*                                │      │            │
│  │                                              │      │            │
│  │  Mastra Agent (src/mastra/):                  │      │            │
│  │  ├─ feedmind-agent (动态模型解析)              │      │            │
│  │  ├─ chatRoute → /api/agent/chat/:agentId      │      │            │
│  │  └─ 工具: web_search, web_fetch, wiki 等      │      │            │
│  │                                              │      │            │
│  │  模块 (modules/):                             │      │            │
│  │  Service → Repository                         │      │            │
│  └──────────────┬────────────────────────────────┘      │            │
│                 │                                       │            │
└─────────────────┼───────────────────────────────────────┼────────────┘
                  │                                       │
     ┌────────────┴────────────┐            ┌──────────────┴───────────┐
     │  SQLite (libSQL/Turso)  │            │  File System             │
     │  ┌──────────────────┐   │            │  ┌────────────────────┐  │
     │  │ chat_sessions    │   │            │  │ data/wiki/         │  │
     │  │ chat_messages    │   │            │  │ ├─ space1/         │  │
     │  │ llm              │   │            │  │ │ ├─ index.json    │  │
     │  │ runtime_config   │   │            │  │ │ ├─ *.md          │  │
     │  │ tools            │   │            │  │ │ ├─ raw/          │  │
     │  │ crawler_tasks    │   │            │  │ └─ space2/         │  │
     │  │ crawler_contents │   │            │  └────────────────────┘  │
     │  │ crawler_creators │   │            └──────────────────────────┘
     │  └──────────────────┘   │
     └─────────────────────────┘
```

### Tech Stack

| 层级 | 技术 |
|------|------|
| **框架** | [TanStack Start](https://tanstack.com/start) (Vite) + [TanStack Router](https://tanstack.com/router) |
| **UI** | React 19、Tailwind CSS 4、shadcn/ui (base-nova)、[ai-elements](https://elements.ai-sdk.dev) |
| **国际化** | [react-i18next](https://react.i18next.com) + i18next-browser-languagedetector |
| **主题** | [next-themes](https://github.com/pacocoursey/next-themes) |
| **图标** | lucide-react、@lobehub/icons |
| **后端 API** | Hono 4 |
| **Agent 框架** | [Mastra](https://mastra.ai) (`@mastra/core`) |
| **AI SDK** | [Vercel AI SDK](https://sdk.vercel.ai) (`ai`, `@ai-sdk/react`, `@ai-sdk/openai`) |
| **ORM** | Drizzle ORM (SQLite) |
| **数据库** | libSQL/Turso (嵌入式 SQLite) |
| **校验** | Zod (契约优先设计) |
| **爬虫** | 自定义多平台引擎 (Playwright) |
| **搜索** | Tavily、Exa、AnySearch (级联回退) |
| **Web 抓取** | Firecrawl、Mozilla Readability、JSDOM、Turndown |
| **图谱** | graphology + louvain 社区检测 |
| **加密** | Fernet (AES-128-CBC + HMAC-SHA256) |
| **测试** | Vitest |
| **代码检查** | ESLint + Prettier |
| **Monorepo** | pnpm workspaces |
| **运行环境** | Node.js ≥ 24 |

---

## 🚀 Getting Started <a name="getting-started"></a>

### 前置要求

- **Node.js** ≥ 24.0.0
- **pnpm** ≥ 11.0.0

### 安装

```bash
# 克隆仓库
git clone https://github.com/your-org/feedmind.git
cd feedmind

# 复制环境变量
cp .env.example .env
# 编辑 .env — ENCRYPTION_KEY 是必需的（用于 API 密钥加密）

# 安装依赖
pnpm install

# 构建共享包
pnpm build:packages

# 初始化 SQLite 数据库
pnpm db:init
```

### 开发

```bash
# 启动所有服务（API + Web）
pnpm dev
```

| 服务 | 地址 |
|------|------|
| Web 前端 | http://localhost:3000 |
| REST API | http://localhost:8000/api/v1/health |

#### 单独启动

```bash
pnpm web:dev     # TanStack Start 开发服务器（端口 3000）
pnpm api:dev     # Hono API + Mastra Agent 服务器（端口 8000）
```

---

## 📁 Project Structure <a name="project-structure"></a>

```
feedmind/
├── apps/
│   ├── web/                          # TanStack Start 前端 (React 19)
│   │   ├── src/routes/               # 路由定义 (/, /chat, /wiki, API 代理)
│   │   ├── components/
│   │   │   ├── ai-elements/          # AI 对话 UI 组件 (Conversation, Message, etc.)
│   │   │   ├── app-shell/            # 布局: 侧边栏、顶栏、错误边界
│   │   │   ├── chat/                 # 聊天: Thread、MessageParts、Composer、ThreadList
│   │   │   ├── settings/             # 模型、工具、运行时配置面板
│   │   │   ├── ui/                   # shadcn/ui 基础组件 (24 个原语)
│   │   │   └── wiki/                 # Wiki 页面、编辑器、图谱、检查、审核
│   │   ├── lib/
│   │   │   ├── api/                  # API 客户端 (chats, llms, wiki, tools, agent)
│   │   │   ├── hooks/                # TanStack Query hooks
│   │   │   ├── chat/                 # ChatContext (useChat 封装)
│   │   │   └── i18n/                 # 国际化配置 + 翻译文件 (zh-CN, en-US)
│   │   └── app/globals.css           # 全局样式 + 设计令牌
│   │
│   ├── api/                          # Hono REST API + Mastra Agent
│   │   ├── src/
│   │   │   ├── routes/v1/            # 路由组: health, llms, chats, wiki, crawler, tools
│   │   │   ├── modules/              # 业务逻辑服务
│   │   │   │   ├── wiki/             # 空间注册、页面存储、来源管理、导入流水线、图谱、搜索
│   │   │   │   ├── crawler/          # 任务管理、数据查询
│   │   │   │   ├── llms/             # 模型 CRUD + 加密
│   │   │   │   ├── chats/            # 会话持久化
│   │   │   │   ├── models/           # 运行时配置
│   │   │   │   └── tools/            # 工具配置 CRUD
│   │   │   └── mastra/               # Mastra Agent
│   │   │       ├── agents/           # Agent 定义 (feedmind-agent)
│   │   │       ├── tools/            # 工具实现 (web-search, web-fetch, wiki)
│   │   │       └── prompts/          # 系统提示词
│   │   └── src/server.ts             # 入口: Hono + Mastra 集成
│   │
├── packages/
│   ├── contracts/                    # Zod 校验 schema（前后端共享）
│   ├── db/                           # Drizzle schema + 迁移 + 初始化
│   ├── shared/                       # 环境配置、Fernet 加密、日期工具
│   ├── crawler-core/                 # 抽象爬虫基类、工厂、平台实现
│   └── wiki-core/                    # Wiki 文件系统、frontmatter、wikilink、图谱
│
├── data/
│   ├── feedmind.db                   # SQLite 数据库
│   └── wiki/                         # Wiki Markdown 文件（按空间组织）
│
├── docs/                             # 设计文档与迁移笔记
├── PRODUCT.md                        # 产品战略与设计原则
├── DESIGN.md                         # 设计系统 (颜色、排版、组件)
└── .impeccable/                       # 设计系统 sidecar + live 模式配置
```

---

## 🎨 设计系统

FeedMind 采用**编辑式杂志风格**的设计语言：

- **色彩**：暖米色画布 (`#f5f5f0`) + 深棕墨色 (`#292524`) 作为品牌色
- **排版**：系统无衬线字体 (SF Pro Display / Inter) + JetBrains Mono (代码)
- **组件**：ai-elements (聊天) + shadcn/ui (通用)
- **层次**：近乎扁平，发丝边框代替阴影
- **氛围**：柔和渐变光晕作为纯装饰元素

详见 [DESIGN.md](./DESIGN.md) 和 [PRODUCT.md](./PRODUCT.md)。

---

## 🔌 API 概览

所有 REST 端点位于 `/api/v1`。

### Health
| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/v1/health` | 健康检查 |

### LLM 模型
| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/v1/llms` | 列出所有模型 |
| `POST` | `/api/v1/llms` | 创建模型 |
| `PUT` | `/api/v1/llms/selected` | 设置选中模型 |
| `GET` | `/api/v1/llms/selected` | 获取选中模型 ID |
| `PUT` | `/api/v1/llms/:id` | 更新模型 |
| `DELETE` | `/api/v1/llms/:id` | 删除模型 |

### 聊天会话
| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/v1/chats` | 列出会话 |
| `GET` | `/api/v1/chats/:id` | 获取会话及消息 |
| `PUT` | `/api/v1/chats/:id` | 保存会话快照 |
| `DELETE` | `/api/v1/chats/:id` | 删除会话 |

### Wiki
| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` / `POST` | `/api/v1/wiki/spaces` | 列出 / 创建空间 |
| `GET` / `POST` | `/api/v1/wiki/spaces/:id/pages` | 列出 / 创建页面 |
| `GET` / `PUT` / `DELETE` | `/api/v1/wiki/spaces/:id/pages/:pageId` | 读取 / 更新 / 删除 |
| `POST` | `/api/v1/wiki/spaces/:id/ingest` | 触发 AI 导入流水线 |
| `POST` | `/api/v1/wiki/spaces/:id/search` | 全文搜索 |
| `GET` | `/api/v1/wiki/spaces/:id/graph` | 知识图谱数据 |
| `POST` | `/api/v1/wiki/spaces/:id/lint` | 链接检查 |

### 爬虫
| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/v1/crawler/platforms` | 列出支持的平台 |
| `POST` | `/api/v1/crawler/tasks` | 创建爬取任务 |
| `GET` | `/api/v1/crawler/tasks` | 列出任务（分页） |
| `GET` | `/api/v1/crawler/contents` | 列出爬取内容 |
| `GET` | `/api/v1/crawler/creators` | 列出爬取的创作者 |

### Agent
Mastra Agent 通过 `POST /api/agent/chat/feedmind` 提供流式聊天补全。内置 5 个工具：

- `web_search` — 网络搜索（Tavily → Exa → AnySearch 级联回退）
- `web_fetch` — 网页抓取（Firecrawl → Readability）
- `wiki_search` — Wiki 全文搜索
- `wiki_read` — Wiki 页面读取
- `ask_clarification` — 意图澄清

---

## 📋 常用命令

| 命令 | 说明 |
|------|------|
| `pnpm install` | 安装所有依赖 |
| `pnpm dev` | 启动所有开发服务（API + Web） |
| `pnpm build` | 构建所有应用和包 |
| `pnpm build:packages` | 仅构建共享包 |
| `pnpm typecheck` | TypeScript 类型检查 |
| `pnpm lint` | ESLint 代码检查 |
| `pnpm test` | 运行测试（Vitest） |
| `pnpm db:init` | 初始化 SQLite 数据库 |
| `pnpm db:migrate` | 运行 Drizzle 迁移 |
| `pnpm web:dev` | 仅启动前端 |
| `pnpm api:dev` | 仅启动 API 服务器 |

---

## 🧩 共享包

| 包 | 说明 |
|----|------|
| `@feedmind/contracts` | Zod 校验 schema 和 TypeScript 类型（所有应用共享） |
| `@feedmind/db` | Drizzle ORM schema、SQLite 客户端、迁移和种子数据 |
| `@feedmind/shared` | 环境变量加载器、日期工具、Fernet 加密 |
| `@feedmind/crawler-core` | 抽象爬虫基类、工厂和平台实现 |
| `@feedmind/wiki-core` | Wiki 文件系统操作、frontmatter 解析、wikilink 解析、图谱构建、搜索、检查 |

---

## 🔐 环境变量

| 变量 | 必需 | 默认值 | 说明 |
|------|------|--------|------|
| `ENCRYPTION_KEY` | **是** | `feedmind` (开发) | 用于加密 LLM API 密钥 |
| `OPENAI_API_KEY` | 按需 | — | OpenAI 兼容 API 密钥 |
| `ANTHROPIC_API_KEY` | Claude 模型 | — | Anthropic API 密钥 |
| `TAVILY_API_KEY` | 网页搜索 | — | Tavily 搜索 API 密钥 |
| `BACKEND_API_URL` | 否 | `http://localhost:8000` | 后端 API 地址 |
| `DATABASE_PATH` | 否 | `./data/feedmind.db` | SQLite 数据库路径 |
| `APP_ENV` | 否 | `development` | 环境模式 |

> **重要：** 生产环境请设置强 `ENCRYPTION_KEY`。开发默认值 `"feedmind"` 不安全。

---

## 📄 License

[MIT](./LICENSE)

---

<div align="center">
  <p>
    Built with React 19, TanStack, Hono, Mastra, and ❤️
  </p>
</div>
