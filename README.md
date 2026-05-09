# FeedMind

FeedMind 是一个基于 Next.js、FastAPI 和 Aegra 的 AI 对话应用。前端负责聊天与模型配置界面，Backend 负责业务 REST API 和模型配置持久化，Agent 由 Aegra 承载并在运行时读取 Backend 中选择的模型配置。

## 项目结构

```text
FeedMind/
├── frontend/              # Next.js + assistant-ui 前端应用
├── backend/               # FastAPI 业务 REST API
├── agent/                 # LangChain Agent 与 Aegra 配置
├── docs/                  # 产品、设计和架构文档
├── prototype/             # 原型资料
├── docker-compose.yml     # Compose 通用基础配置
├── docker-compose.override.yml # 本地开发热加载覆盖配置
├── docker-compose.prod.yml # 生产运行覆盖配置
├── .env.example           # Docker Compose 环境变量模板
└── README.md
```

## 功能说明

- 对话界面：基于 assistant-ui 与 Aegra 兼容 API 创建线程、加载历史状态并消费流式回复。
- Agent 运行：Aegra 加载 `feedmind` assistant，执行 LangChain Agent。
- 模型配置：Backend 提供模型配置、运行时凭据读取和当前选中模型保存接口。
- 会话持久化：前端在对话完成后把 Aegra 线程快照写入 Backend。
- 数据服务：Postgres 保存 Backend 业务数据和 Aegra 运行状态，Redis 供 Aegra 使用。

## Docker Compose 使用方式

项目使用 Docker Compose 多文件配置：

- `docker-compose.yml`：通用基础服务、网络、健康检查和依赖关系。
- `docker-compose.override.yml`：本地开发配置，Docker Compose 默认自动加载，支持前端、Backend 热加载和 Agent watch。
- `docker-compose.prod.yml`：生产运行配置，需要显式指定。

1. 创建环境变量文件：

```bash
cp .env.example .env
```

2. 按需编辑 `.env`：

```bash
LANGSMITH_API_KEY=
AEGRA_PORT=2026
NEXT_PUBLIC_AEGRA_API_URL=http://localhost:2026
NEXT_PUBLIC_AEGRA_ASSISTANT_ID=feedmind
```

### 开发热加载

默认 `docker compose` 会自动合并 `docker-compose.yml` 和 `docker-compose.override.yml`。

构建并启动开发环境：

```bash
docker compose up --build
```

前端运行 `next dev`，Backend 运行 `fastapi dev`，修改对应源码后会自动生效。Agent 代码可使用 Compose watch 触发同步和重启：

```bash
docker compose watch
```

### 生产运行

生产环境显式加载 `docker-compose.prod.yml`，避免自动使用开发覆盖配置：

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

访问服务：

```text
Frontend:      http://localhost:3000
Backend API:   http://localhost:8000/api/health
Aegra API:     http://localhost:2026/health
```

停止服务：

```bash
docker compose down
```

如需清空数据库和 Redis 数据：

```bash
docker compose down -v
```
