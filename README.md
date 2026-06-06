<div align="center">
  <img src="./apps/web/public/FeedMind-logo-text.png" alt="FeedMind" width="320" />
  <p><strong>本地优先的 AI 对话与知识管理平台，集成多平台内容抓取。</strong></p>
  <p>
    <img src="https://img.shields.io/badge/node-%3E%3D24.0.0-brightgreen" alt="Node" />
    <img src="https://img.shields.io/badge/pnpm-%3E%3D11.0.0-orange" alt="pnpm" />
    <img src="https://img.shields.io/badge/TypeScript-strict-blue" alt="TypeScript" />
    <img src="https://img.shields.io/badge/license-MIT-green" alt="License" />
  </p>
</div>

---

## 简介

FeedMind 是一个本地优先的 monorepo 应用，将 AI 对话、基于文件系统的 Wiki 知识库和多平台内容抓取整合到统一的工作流中。

技术栈：**Next.js 16** + **React 19** + **Hono** + **LangChain/LangGraph**，全量严格 TypeScript。

## 功能特性

- **AI 对话** — 多模型 LLM 聊天，支持流式输出、工具调用和 LangGraph Agent 工作流
- **Wiki 知识库** — Markdown + frontmatter 文件驱动，支持 `[[wikilink]]` 交叉引用、反向链接、多页面类型和来源管理
- **知识图谱** — 可视化 Wiki 页面及其关联关系的知识图谱，支持社区发现
- **内容抓取** — 可插拔的多平台爬虫引擎（小红书、抖音、B站、微博、知乎、快手、贴吧），基于 Playwright
- **Lint 与 Review** — 内置 Wiki 链接检查和 AI 驱动的知识库质量审查
- **文件存储** — Wiki 页面以纯 Markdown 文件存储，无供应商锁定
- **本地优先** — 数据保存在本地机器，SQLite 存储，无需联网

## 快速开始

### 环境要求

- **Node.js** >= 24
- **pnpm** >= 11

### 安装

```bash
# 克隆仓库
git clone https://github.com/your-org/feedmind.git
cd feedmind

# 配置环境变量
cp .env.example .env
# 编辑 .env — 设置 ENCRYPTION_KEY（用于加密模型 API Key）

# 安装依赖
pnpm install

# 构建共享包
pnpm build:packages

# 初始化数据库
pnpm db:init
```

### 启动开发服务

```bash
# 一键启动所有服务（前端 + API + Agent）
pnpm dev
```

| 服务 | 地址 |
|------|------|
| Web 前端 | http://localhost:3000 |
| REST API | http://localhost:8000/api/v1/health |
| Agent API | http://localhost:2024/docs |

## 使用指南

### AI 对话

访问 `/chat` 开始对话。通过配置中心可管理多个 LLM 供应商和模型：

- **供应商支持** — OpenAI、Anthropic、DeepSeek、Gemini、Grok、Qwen 等
- **Agent 模式** — 基于 LangGraph 的 Agent 工作流，支持工具调用、联网搜索和内容提取
- **会话管理** — 线程式对话历史

### Wiki 知识库

访问 `/wiki` 创建和管理你的知识库。

```
data/wiki/
├── my-space/               # 每个空间对应一个目录
│   ├── index.md            # 空间概览
│   ├── concepts/
│   │   └── 机器学习.md     # 页面文件带 YAML frontmatter
│   └── entities/
│       └── 爱因斯坦.md
└── another-space/
    └── ...
```

- **页面类型** — 实体、概念、来源、概览、对比、综合
- **交叉引用** — 使用 `[[wikilink]]` 链接其他页面，反向链接自动解析
- **来源管理** — 关联 URL 或上传文件作为页面来源，支持内容摄入
- **知识图谱** — 图谱视图可视化页面之间的连接关系
- **Lint** — 检查断链、缺失页面和结构问题
- **Review** — AI 驱动的审查：矛盾检测、重复发现、改进建议

### 内容抓取

通过 REST API 触发抓取任务，爬虫基于 Playwright 和 Cookie 认证。

```
POST /api/v1/crawler/start
{
  "platform": "xhs",
  "keywords": ["机器学习"],
  "limit": 20
}
```

## 项目架构

```
FeedMind/
├── apps/
│   ├── web/              # Next.js 16 前端（assistant-ui, shadcn/ui）
│   ├── api/              # Hono REST API（Wiki、爬虫、模型管理）
│   └── agent/            # LangChain.js + LangGraph Agent 服务
├── packages/
│   ├── contracts/        # Zod 契约 + 共享 TypeScript 类型
│   ├── db/               # Drizzle ORM 定义 + SQLite 初始化
│   ├── shared/           # 环境变量、加密、工具函数
│   ├── crawler-core/     # 多平台内容抓取引擎
│   └── wiki-core/        # Wiki 文件系统操作与解析
├── data/                 # 运行时数据（Wiki 文件、配置）
└── docs/                 # 设计文档
```

### 技术栈

| 层 | 技术 |
|------|-----------|
| **前端** | Next.js 16, React 19, Tailwind CSS 4, shadcn/ui (base-nova), assistant-ui |
| **API** | Hono, Drizzle ORM, libSQL/Turso |
| **Agent** | LangChain.js, LangGraph, LangGraph CLI |
| **爬虫** | Playwright, 各平台 API 客户端 |
| **数据库** | SQLite（via libSQL）, Drizzle ORM |
| **语言** | TypeScript（strict mode） |
| **Monorepo** | pnpm workspaces |

## 常用命令

```bash
pnpm install            # 安装所有依赖
pnpm dev                # 启动所有开发服务
pnpm build              # 构建所有包和应用
pnpm build:packages     # 仅构建共享包
pnpm typecheck          # TypeScript 类型检查
pnpm lint               # ESLint 代码检查
pnpm test               # 运行测试
pnpm db:init            # 初始化 SQLite 数据库
pnpm db:migrate         # 执行 Drizzle 迁移

# 单独启动各服务
pnpm web:dev            # 仅前端
pnpm api:dev            # 仅 API
pnpm agent:dev          # 仅 Agent
```

## 环境变量

| 变量 | 说明 | 必填 |
|----------|-------------|------|
| `ENCRYPTION_KEY` | 加密 LLM API Key 的密钥 | 是 |
| `OPENAI_API_KEY` | OpenAI 兼容 API Key | Agent 模式需要 |
| `ANTHROPIC_API_KEY` | Anthropic API Key | Claude 模型需要 |
| `TAVILY_API_KEY` | Tavily 搜索 API Key | 联网搜索 Agent 需要 |

将 `.env.example` 复制为 `.env` 后填入对应值。

## 项目状态

FeedMind 正在活跃开发中。核心 Chat 和 Wiki 功能已可用；爬虫模块和 Agent 工作流持续迭代中。

## 许可证

[MIT](./LICENSE)
