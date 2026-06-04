# FeedMind

本地优先的 AI 对话与知识管理应用。基于 pnpm TypeScript monorepo 架构，提供 AI 对话、Wiki 知识库、内容抓取等功能。

## 项目结构

```
FeedMind/
├── apps/
│   ├── web/          # Next.js 16 + React 19 + assistant-ui 前端
│   ├── api/          # Hono REST API 服务
│   └── agent/        # LangChain.js + LangGraph JS Agent 服务
├── packages/
│   ├── contracts/    # Zod schema + TypeScript 共享类型
│   ├── db/           # Drizzle ORM schema + SQLite 初始化
│   ├── shared/       # 环境变量、加密、日期工具、常量
│   └── crawler-core/ # 多平台内容抓取引擎
├── docs/             # 设计文档和迁移计划
├── data/             # 运行时数据（Wiki 文件、配置等）
├── start-dev.ps1     # Windows 开发启动脚本
├── start-dev.sh      # macOS/Linux 开发启动脚本
└── pnpm-workspace.yaml
```

## 核心功能

### AI 对话
- 多模型 LLM 聊天界面（assistant-ui）
- LangGraph Agent 工作流支持
- 工具调用与插件机制

### Wiki 知识库（文件系统驱动）
- Markdown + YAML frontmatter 文件存储
- 支持实体、概念、来源、查询、对比、综合等多种页面类型
- `[[wikilink]]` 交叉引用与自动解析
- 反向链接图（谁链接了此页面）
- 来源管理（关联知识点）

### 内容抓取（Crawler）
- 多平台内容抓取（小红书、抖音等）
- 任务管理与进度追踪
- 内容/创作者数据持久化

## 启动方式

### 环境要求
- Node.js 24+
- pnpm 11+

### 环境变量

```powershell
# 首次使用复制模板
Copy-Item .env.example .env
```

`ENCRYPTION_KEY` 用于加密模型 API Key，修改后旧密文将无法解密。

### 一键启动

```powershell
# Windows PowerShell
.\start-dev.ps1
```

```bash
# macOS / Linux
./start-dev.sh
```

启动后访问：

| 服务 | 地址 |
|------|------|
| Web 前端 | http://localhost:3000 |
| API 服务 | http://localhost:8000/api/v1/health |
| Agent API | http://localhost:2024/docs |

## 常用命令

```powershell
pnpm install          # 安装依赖
pnpm dev              # 启动所有服务
pnpm build:packages   # 构建共享包
pnpm typecheck        # 类型检查
pnpm lint             # 代码检查
pnpm build            # 构建
pnpm db:init          # 初始化数据库
```

单独启动各服务：

```powershell
pnpm web:dev          # 仅启动前端
pnpm api:dev          # 仅启动 API
pnpm agent:dev        # 仅启动 Agent
```

## Wiki 数据

Wiki 基于文件系统存储，默认路径为 `data/wiki/`。每个空间对应一个目录，页面以 Markdown 文件存储，frontmatter 包含元数据（类型、标签、来源、创建时间等）。可通过 `WIKI_DIR` 环境变量自定义根目录。

## 技术栈

- **前端:** Next.js 16, React 19, Tailwind CSS 4, assistant-ui, shadcn/ui
- **后端:** Hono, LangChain.js, LangGraph
- **数据库:** SQLite (via libsql/Turso)
- **语言:** TypeScript (strict mode)
- **包管理:** pnpm workspace
