# FeedMind

<div align="center">
  <img src="./apps/web/public/FeedMind-logo-text.png" alt="FeedMind" width="360" />
  <p><strong>本地优先的趋势研究 AI Agent 系统</strong></p>

  <p>
    <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D24.0.0-brightgreen.svg" alt="Node.js"></a>
    <a href="https://pnpm.io"><img src="https://img.shields.io/badge/pnpm-11-blue.svg" alt="pnpm"></a>
    <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/typescript-strict-blue.svg" alt="TypeScript"></a>
    <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License"></a>
  </p>

  <p>
    <a href="#-特性"><strong>特性</strong></a> •
    <a href="#-快速开始"><strong>快速开始</strong></a> •
    <a href="#-项目结构"><strong>项目结构</strong></a> •
    <a href="#-技术栈"><strong>技术栈</strong></a> •
    <a href="#-开发指南"><strong>开发指南</strong></a> •
    <a href="#-api-参考"><strong>API 参考</strong></a>
  </p>
</div>

---

## 📖 关于项目

**FeedMind** 是一个本地优先（Local-first）的趋势研究 AI Agent 系统，致力于构建从「信息收集 → AI 分析 → 知识沉淀」的完整工作流。

### 核心理念

```
网络信息收集 → AI 深度分析 → 结构化知识库
```

所有数据保存在本地 SQLite + Markdown 文件系统，不依赖云服务，确保隐私和数据所有权。支持中英文双语和明暗主题切换。

---

## ✨ 核心特性

### 🤖 AI Agent 对话系统

基于 **Mastra AI** 框架构建的智能助手：

- **多模型支持** — 兼容 OpenAI、Anthropic、DeepSeek、Gemini、Grok、Qwen 及所有 OpenAI API 兼容服务
- **流式响应** — 实时输出推理过程、工具调用和最终答案
- **工具生态** — 内置网络搜索（Tavily/Exa）、网页内容提取（Firecrawl/Readability）、Wiki 查询、自定义工具
- **动态 Subagent** — 根据任务自动创建研究者、提取器、总结者等子 agent
- **会话管理** — 持久化历史、模型热切换、分支对话

### 📚 Wiki 知识库

文件级知识库管理系统：

- **Markdown 原生** — 页面为纯文本 Markdown，YAML frontmatter 元数据，可纳入 Git 版本控制
- **多空间隔离** — 独立知识库空间，目录即分类
- **双向链接** — OKF 标准格式，自动反向链接追踪
- **知识图谱可视化** — Graphology 驱动的节点关系图 + Louvain 社区检测算法
- **智能搜索** — CJK 分词全文检索（中文分词支持）
- **来源管理** — 附加 URL 或上传文件（PDF、Word、图片）作为参考资料
- **AI 导入流水线** — LLM 自动分析源内容，生成结构化 Wiki 页面
- **质量检查** — 死链检测、内容审核、重复检测
- **OKF v0.2 规范支持** — Google Open Knowledge Format 标准兼容，含来源/生成者/信任信号（sources、generated、verified、status、stale_after）、自动索引生成、标签体系、更新日志模板

### 🕷️ 爬虫引擎

路由驱动的多平台爬取系统：

- **路由注册机制** — 类似 RSSHub 的模块化设计，每个平台功能独立路由
- **多平台支持** — 小红书、Bilibili、知乎、抖音、快手等
- **双模式降级策略**：
  - ✅ Cookie 存在 → HTTP 直接 API 请求（高性能）
  - ⚠️ 无 Cookie/反爬 → Playwright 浏览器自动化（兜底方案）
- **Cookie Cloud 同步** — Chrome 插件自动采集登录态，一键注入
- **RSS 输出** — 统一 RSS 2.0 XML 格式，含封面图、分类标签

### 🔐 安全与隐私

- **加密存储** — Fernet 兼容的 AES-128-CBC + HMAC-SHA256 加密 API 密钥
- **日志脱敏** — Pino logger 自动过滤敏感字段（apiKey、password、cookies）
- **SSRF 防护** — 所有外部 URL 请求前进行白名单校验
- **本地数据库** — libSQL（嵌入式 SQLite），数据完全可控

---

## 🚀 快速开始

### 前置要求

- Node.js ≥ 24.0.0
- pnpm ≥ 11.0.0（安装：`npm install -g pnpm@latest`）

### 初始设置

```bash
# 1. 克隆仓库
git clone https://github.com/flyemFSB/FeedMind.git
cd FeedMind

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，生成 ENCRYPTION_KEY：
# openssl rand -hex 32

# 3. 安装依赖
pnpm install

# 4. 构建共享包（必须）
pnpm run build:packages

# 5. 初始化数据库
pnpm run db:init
```

### 启动开发服务

```bash
# 同时启动 API 后端和 Web 前端
pnpm run dev
```

访问地址：

| 服务             | 地址                                  | 说明                 |
| ---------------- | ------------------------------------- | -------------------- |
| **Web 应用**     | http://localhost:13790                | Vite + React 前端    |
| **REST API**     | http://localhost:18790                | Hono 后端            |
| **API 文档**     | http://localhost:18790/api/v1/docs    | Scalar UI 交互式文档 |
| **OpenAPI JSON** | http://localhost:18790/api/v1/openapi | 机器可读规范         |

### 桌面应用（Electron）

FeedMind 可打包为 Windows 桌面应用：主进程内嵌 API，爬虫与 Agent 浏览器通过 CDP 驱动应用内置 Chromium（隐藏爬虫窗口），不再自起 Chrome。

```bash
# 开发模式：Vite（热更新） + Electron，爬虫经 CDP 连接内置 Chromium
pnpm run desktop:dev

# 生产模式：构建全部产物并直接运行桌面应用（内置 HTTP 服务同源提供 UI 与 API）
pnpm run desktop

# 打包 Windows 安装程序（NSIS）
pnpm --filter @feedmind/desktop dist
```

### 常用命令

```bash
# 单服务开发
pnpm run web:dev   # 仅前端
pnpm run api:dev   # 仅后端

# 构建与测试
pnpm run build          # 构建全部
pnpm run build:packages # 仅构建共享包
pnpm run typecheck      # TypeScript 类型检查
pnpm run lint           # ESLint + Prettier
pnpm run test           # Vitest 单元测试

# 数据库管理
pnpm run db:generate    # 生成迁移文件
pnpm run db:migrate     # 运行迁移
pnpm run db:reset       # 重置数据库
```

---

## 📁 项目结构

```
feedmind/
├── apps/                          # 应用程序根目录
│   ├── api/                       # REST API + Mastra Agent
│   │   ├── src/
│   │   │   ├── lib/              # 通用工具（logger、openapi、http）
│   │   │   ├── routes/v1/        # OpenAPI v1 路由组
│   │   │   │   ├── health.ts     # 健康检查
│   │   │   │   ├── chats.ts      # 会话管理
│   │   │   │   ├── llms.ts       # 模型配置
│   │   │   │   ├── wiki.ts       # Wiki 知识库 API
│   │   │   │   ├── crawler.ts    # 爬虫任务
│   │   │   │   ├── tools.ts      # 工具配置
│   │   │   │   ├── skills.ts     # 技能包
│   │   │   │   ├── runtime-config.ts # 运行时配置
│   │   │   │   └── ...
│   │   │   ├── modules/          # 业务模块
│   │   │   │   ├── wiki/         # Wiki 核心逻辑（空间、页面、导入、图谱）
│   │   │   │   ├── crawler/      # 爬虫任务队列
│   │   │   │   ├── chat/         # 聊天逻辑
│   │   │   │   └── remote-connection/ # Cookie 管理
│   │   │   └── mastra/           # AI Agent 定义
│   │   │       ├── agents/       # feedmind-agent 主 agent
│   │   │       ├── tools/        # 工具实现
│   │   │       └── subagents/    # 子 agent 模板
│   │   ├── server.ts             # 入口文件
│   │   └── package.json
│   │
│   └── web/                       # React 19 前端（Vite SPA）
│       ├── src/
│       │   ├── routes/           # TanStack Router 文件路由
│       │   │   ├── wiki.tsx      # Wiki 阅读器
│       │   │   ├── feeds.index.tsx # 资讯首页
│       │   │   └── ...
│       │   ├── router.tsx        # 路由实例
│       │   └── main.tsx          # 入口文件
│       ├── components/            # React 组件
│       │   ├── ai-elements/      # AI 对话组件
│       │   ├── chat/             # 聊天界面
│       │   ├── wiki/             # Wiki 编辑器、图谱、导入
│       │   ├── settings/         # 设置面板
│       │   └── ui/               # shadcn/ui 基础组件
│       ├── lib/                   # 工具库
│       │   ├── api/              # API 客户端
│       │   ├── i18n/             # 国际化
│       │   └── hooks/            # 自定义 hooks
│       └── package.json
│
├── packages/                      # 共享包
│   ├── contracts/                # Zod schema（前后端共享契约）
│   ├── db/                       # Drizzle ORM + SQLite
│   ├── shared/                   # 加密、日期工具
│   ├── env/                      # 环境变量加载
│   ├── crawler-core/             # 爬虫引擎核心
│   │   ├── src/
│   │   │   ├── core/            # 浏览器管理、RSS 构建
│   │   │   └── routes/          # 平台实现（xhs、bili、zhihu...）
│   │   └── package.json
│   └── wiki-core/                # Wiki 文件系统操作
│       ├── src/
│       │   ├── page-store.ts    # 页面 CRUD
│       │   ├── graph.ts         # 图谱构建
│       │   ├── search.ts        # 全文检索
│       │   └── links.ts         # 双向链接解析
│       └── package.json
│
├── data/                          # 数据目录（Git 忽略）
│   ├── feedmind.db               # SQLite 数据库
│   └── wiki/                     # Wiki Markdown 文件
│
├── CLAUDE.md                      # AI 开发规范
├── DESIGN.md                      # 架构设计说明
├── docs/                          # 文档与研究
│   └── research/                 # 技术研究
│
├── .husky/                        # Git hooks
├── eslint.config.mjs              # ESLint 扁平配置
├── prettier.config.mjs            # Prettier 配置
├── commitlint.config.mjs          # Commit 规范
├── tsconfig.base.json             # TypeScript 基础配置
├── vitest.config.ts               # 测试配置
└── pnpm-workspace.yaml            # Monorepo 配置
```

---

## 🧰 技术栈

### 前端

| 技术                | 版本   | 用途                    |
| ------------------- | ------ | ----------------------- |
| **React**           | 19     | UI 库                   |
| **Vite**            | 8      | 构建工具 + 开发服务器   |
| **TanStack Router** | latest | 文件路由 + 自动代码分割 |
| **Tailwind CSS**    | 4      | 原子化 CSS              |
| **shadcn/ui**       | latest | 组件库                  |
| **Milkdown Crepe**  | 7.x    | Markdown 所见即得编辑器 |
| **motion**          | latest | 动画                    |
| **Zod**             | 4      | 运行时验证              |
| **i18next**         | latest | 国际化                  |
| **Vercel AI SDK**   | 7.x    | AI 流式对话集成         |

### 后端

| 技术            | 版本   | 用途             |
| --------------- | ------ | ---------------- |
| **Hono**        | 4.x    | 轻量 Web 框架    |
| **Mastra**      | latest | AI Agent 框架    |
| **Drizzle ORM** | latest | TypeScript ORM   |
| **libSQL**      | latest | 嵌入式 SQLite    |
| **Pino**        | 10.x   | 结构化日志       |
| **zod-openapi** | latest | OpenAPI 3.1 规范 |

### 中间件与服务

| 技术           | 用途                     |
| -------------- | ------------------------ |
| **Playwright** | 浏览器自动化（爬虫兜底） |
| **Graphology** | 图数据结构与算法         |
| **Firecrawl**  | 网页内容提取             |
| **Tavily/Exa** | 网络搜索 API             |

---

## 🛠️ 开发指南

### 代码规范

#### 提交规范

遵循 [Conventional Commits](https://www.conventionalcommits.org/)：

```bash
feat(wiki): 添加知识图谱可视化组件
fix(api): 修复爬虫任务状态同步 bug
chore(deps): 升级 Mastra 到最新版本
docs(readme): 更新快速开始步骤
refactor(search): 优化中文分词算法
test(crawler): 补充小红书路由测试
style(eslint): 启用 no-floating-promises 规则
perf(ingest): 引入缓存减少 IO 开销
```

#### 命名约定

- 文件名：`kebab-case`（如 `wiki-page-list.tsx`）
- 变量/函数：`camelCase`
- 类型/接口：`PascalCase`
- 未用参数：`_prefix`（如 `_signal`, `_options`）

#### 代码质量

提交前自动运行：

```bash
pnpm lint-staged  # Prettier 格式化
commitlint        # Commit 消息校验
```

推送前需通过：

```bash
pnpm run typecheck && pnpm run lint
```

### 数据库迁移

```bash
# 修改 schema 后生成迁移
pnpm --filter @feedmind/db db:generate

# 应用迁移到本地数据库
pnpm --filter @feedmind/db db:migrate

# 重置数据库（开发时调试用）
pnpm --filter @feedmind/db db:reset
```

### 调试技巧

1. **日志输出**： Pino 自动脱敏，无需担心泄露密钥
2. **API 调试**：使用 Scalar UI 或 Postman 测试
3. **前端调试**：React DevTools + TanStack DevTools
4. **代理拦截**：Chrome Network 面板监听 `/api/v1/*` 请求

---

## 🔌 API 参考

### 认证与安全

除公开端点外，大部分 API 不需要显式认证（本地应用）。敏感操作通过 `.env`中的`ENCRYPTION_KEY` 加密密钥保护。

### 主要端点

#### AI 对话

```http
POST /api/agent/chat/:agentId
Content-Type: application/json

{
  "message": "分析一下最新的大模型趋势",
  "context": ["previous-chat-id"]
}
```

#### Wiki 知识库

```http
GET  /wiki/spaces                    # 列出所有空间
POST /wiki/spaces                    # 创建空间
GET  /wiki/spaces/:id/pages          # 列出页面
POST /wiki/spaces/:id/pages          # 创建页面
PUT  /wiki/spaces/:id/pages/:pageId  # 更新页面
DELETE /wiki/spaces/:id/pages/:pageId # 删除页面
GET  /wiki/spaces/:id/graph          # 获取知识图谱
POST /wiki/spaces/:id/search         # 搜索页面
POST /wiki/spaces/:id/ingest         # 导入外部内容
```

#### 爬虫任务

```http
GET  /crawler/tasks                  # 列表
POST /crawler/tasks                  # 创建任务
DELETE /crawler/tasks/:id            # 取消任务
GET  /crawler/tasks/:id/rss          # RSS 输出
```

#### 模型管理

```http
GET  /llms                           # 列出模型
POST /llms                           # 添加模型
PATCH  /llms/:id                     # 更新模型
DELETE /llms/:id                     # 删除模型
POST /llms/selected                  # 选中默认模型
```

完整文档：http://localhost:18790/api/v1/docs

---

## 🔑 环境变量

| 变量                    | 必需   | 默认值               | 说明                                                             |
| ----------------------- | ------ | -------------------- | ---------------------------------------------------------------- |
| `ENCRYPTION_KEY`        | **是** | —                    | AES 加密密钥，用于加密 API 密钥。<br>`openssl rand -hex 32` 生成 |
| `DATABASE_PATH`         | 否     | `./data/feedmind.db` | SQLite 数据库路径                                                |
| `WIKI_DIR`              | 否     | `data/wiki`          | Wiki Markdown 目录                                               |
| `API_PORT`              | 否     | `18790`              | API 服务端口                                                     |
| `DISABLE_INGEST_WORKER` | 否     | —                    | 禁用后台导入进程（`1`=真）                                       |
| `LLM_API_KEY_*`         | 按需   | —                    | 各模型 API 密钥（加密存储）                                      |

完整示例见 `.env.example`。

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'feat: add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 打开 Pull Request

### 开发前提

- 已运行 `pnpm install` 和 `pnpm run build:packages`
- 代码符合 ESLint + Prettier 规范
- 新增功能需包含单元测试（Vitest）

---

## 📄 许可证

[MIT License](./LICENSE)

---

<div align="center">

**Built with ❤️ using React 19, Hono, Mastra & TanStack Router**

本地 · 安静 · 你的知识引擎

</div>
