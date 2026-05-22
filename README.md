# FeedMind

FeedMind 是一个本地优先的 AI 对话与个人 WIKI 应用，由三个本地服务组成：

- `frontend/`：Next.js 16 + React 19 前端，提供对话、模型设置和 WIKI 界面。
- `backend/`：FastAPI REST API，负责模型配置、会话快照、WIKI 数据和数据库初始化。
- `agent/`：LangGraph Server 加载 `feedmind` Agent，负责聊天流、工具调用和 checkpoint。

当前默认使用本地 PostgreSQL + pgvector。开发脚本会通过 Docker 启动数据库容器，Backend 启动时会创建表并写入演示 WIKI 数据。

## 项目结构

```text
FeedMind/
├── frontend/        # Next.js 前端应用
├── backend/         # FastAPI 业务 API
├── agent/           # LangGraph Agent 服务
├── scripts/         # 本地启动脚本
├── prototype/       # 原型图片与视觉素材
├── DESIGN.md        # 产品与设计说明
├── .env.example     # 必要环境变量模板
└── README.md
```

## 功能

- AI 对话：assistant-ui 消费 LangGraph 流式响应，支持历史线程和重新进入会话。
- 模型配置：在前端设置 OpenAI-compatible 模型，Backend 加密保存 API Key。
- Agent 工具：Agent 内置网页搜索和网页抓取工具。
- 我的 WIKI：维护 WIKI 空间、来源、页面列表、搜索和知识图谱视图。
- 会话持久化：对话完成后把 LangGraph 线程快照写入 Backend。

## 依赖

- Python 3.12+
- uv
- Node.js 22+
- pnpm
- Docker Desktop（用于本地 PostgreSQL + pgvector）

## 环境变量

首次启动前复制模板：

```powershell
Copy-Item .env.example .env
```

默认模板已经满足本地开发。生产或长期使用时，请把 `ENCRYPTION_KEY` 改成固定的高强度值；如果改动它，之前保存的模型 API Key 将无法解密。

## 一键启动

Windows PowerShell：

```powershell
.\scripts\start-local.ps1
```

脚本会：

1. 如不存在 `.env`，从 `.env.example` 复制一份。
2. 启动 `feedmind-postgres` Docker 容器并启用 pgvector。
3. 安装 Backend、Agent、Frontend 依赖。
4. 分别启动 Backend、Agent API 和 Frontend。

启动后访问：

```text
Frontend:    http://localhost:3000
Backend API: http://localhost:8000/api/health
Agent API:   http://localhost:2024/docs
```

如果依赖已经安装，可跳过安装：

```powershell
.\scripts\start-local.ps1 -SkipInstall
```

如果已有可用数据库，可跳过 Docker 数据库启动：

```powershell
.\scripts\start-local.ps1 -SkipDb
```

## 手动启动

数据库：

```powershell
.\scripts\start-db.ps1
```

Backend：

```powershell
cd backend
uv sync
uv run fastapi dev app/main.py --host 127.0.0.1 --port 8000
```

Agent API：

```powershell
cd agent
uv sync
$env:TZ = "Asia/Shanghai"
$env:BACKEND_API_URL = "http://localhost:8000"
uv run langgraph dev --host 127.0.0.1 --port 2024
```

Frontend：

```powershell
cd frontend
pnpm install
$env:BACKEND_API_URL = "http://localhost:8000"
$env:AGENT_API_URL = "http://localhost:2024"
pnpm dev
```

## 测试

Backend：

```powershell
cd backend
uv run pytest
```

Frontend：

```powershell
cd frontend
pnpm test
```

## 数据与本地状态

- PostgreSQL 数据保存在 Docker volume `feedmind-pgdata`。
- 本地 `.env`、虚拟环境、依赖目录、构建产物、测试缓存和 LangGraph 运行目录不会提交。
- 重置本地数据库可删除 `feedmind-postgres` 容器和 `feedmind-pgdata` volume。
