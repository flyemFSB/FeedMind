## Node.js → Bun 迁移分析

> **2026-06-16 更新：决策已逆转。本项目已完成 Bun → Node.js 的全量迁移，当前使用 pnpm + Node.js。**
> 保留此文件作为历史记录。

### 项目当前技术栈概况

| 层 | 技术 | Bun 兼容性 |
|---|---|---|
| 运行时 | Node.js ≥24 | — |
| 包管理 | pnpm 11.6 | ⚠️ 需迁移 |
| 后端框架 | Hono v4 | ✅ 一等支持 |
| AI 框架 | @mastra/core v1 | ⚠️ 需验证 |
| 前端框架 | TanStack Start (Vite) | ✅ 需 `--bun` 标志 |
| 数据库 | @libsql/client (纯 JS 模式) | ✅ 兼容 |
| ORM | Drizzle ORM | ✅ 有专门文档 |
| 测试 | Vitest | ✅ 可替换为 `bun test` |
| 原生模块 | **零 native 模块** | ✅ 关键优势 |

---

### 一、兼容性分析

#### ✅ 确定可行的

- **Hono** — Bun 有一等支持，`bun create hono` 官方模板
- **Drizzle ORM + libSQL** — Bun 官方文档有专门指南
- **Zod v4** — 纯 TypeScript，无兼容问题
- **所有内部包** — contracts / shared / db / wiki-core / crawler-core 均无原生依赖
- **React 19 + Tailwind v4** — 前端框架无关，Vite 构建即可
- **Lucide / sonner / motion / i18next** — 纯 JS/TS 包

#### ⚠️ 需要验证

- **@mastra/core v1.41.0** — 核心是纯 TS，但：
  - `@mastra/core` dist 中有 `node:child_process` 使用（LocalSandbox）
  - `@mastra/hono` 使用 Hono + `node:http`
  - 需实际运行 `bun run` 验证 Agent 的流式响应是否正常
- **Playwright（crawler-core）** — 需要 `--bun` 标志，可能需要在 Bun 外运行
- **node:http 流式传输** — Bun 的 `node:http` 出站请求体是 **缓冲而非流式**，可能影响 API 的流式响应能力

#### ❌ 不兼容 / 需替代

- **pnpm** — Bun 使用 `bun.lock`（二进制，无法在 PR 中 diff），node_modules 扁平布局（非 pnpm 隔离模式）
- **tsx** — 可用 `bun --watch` 替代
- **`node:repl`** / **`node:trace_events`** — 未实现（项目中未使用）

#### 零原生模块：关键发现

项目依赖树中**没有任何** node-gyp / N-API 原生模块（无 `better-sqlite3`、`sharp`、`bcrypt`、`prisma`、`grpc`），这是迁移到 Bun 的最大利好因素。如果项目使用了这些包中的任何一个，迁移都可能受阻。

---

### 二、迁移影响

#### 正面

| 方面 | 影响 |
|---|---|
| **启动速度** | 冷启动 ~5ms vs Node.js ~25ms（实测 4-5x 快） |
| **dev 体验** | `bun --watch` 替代 `tsx watch`，无需 tsx |
| **bun:sqlite** | 比 better-sqlite3 快 3-6x（但项目使用 @libsql/client） |
| **包安装** | `bun install` 比 `pnpm install` 快 8x |
| **测试** | `bun test` Jest 兼容，替代 Vitest |

#### 负面

| 方面 | 影响 |
|---|---|
| **锁文件** | `bun.lock` 是二进制格式，PR diff 不可读。可通过 `--yarn` 生成 `yarn.lock` 缓解 |
| **node_modules 布局** | 扁平 hoisted，不再有 pnpm 的严格隔离。可能引入未声明依赖的隐式引用 |
| **生命周期脚本** | 默认不执行 `postinstall`，需手动配置 `trustedDependencies` |
| **CI/CD** | 需要在 CI 中安装 Bun，pnpm 的 `--filter` 等效写法需调整 |
| **团队学习** | 需要适应 Bun 的 CLI 惯例和工具链 |

#### 中性 / 可缓解

| 方面 | 说明 |
|---|---|
| **`--bun` 标志** | Vite/TanStack Start 的 CLI 需要加 `--bun`，否则仍用 Node.js 执行 |
| **mastra Agent 流式** | Bun 对 `node:http` 出站请求体使用缓冲而非流式。需验证 `@mastra/ai-sdk` 的 `chatRoute` 流式响应是否正常 |
| **自动迁移** | `bun install` 会自动迁移 `pnpm-lock.yaml`，原文件不受影响 |

---

### 三、Tauri 集成分析

#### 架构模型

```
Tauri 桌面窗口 (WebView)          Bun Sidecar (API 服务器)
┌──────────────────────┐     HTTP    ┌──────────────────────┐
│  TanStack Start UI   │ ←────────→ │  Hono API + Mastra   │
│  (静态文件)            │  localhost  │  Drizzle + SQLite    │
│  系统 WebView 渲染     │   :8000    │  Wiki / Crawler 模块  │
└──────────────────────┘            └──────────────────────┘
```

#### 与 Electron 对比

| 指标 | Tauri | Electron |
|---|---|---|
| 打包体积 | ~3-5 MB | ~150-200 MB |
| 空闲内存 | ~30-80 MB | ~100-300 MB |
| 浏览器引擎 | 系统 WebView | 捆绑 Chromium |
| 后端语言 | Rust | Node.js |
| 安全性 | 更强（禁用 eval、API 白名单） | 较弱 |

#### 对 FeedMind 的实际意义

- Tauri **替换的是前端壳**（Electron → 系统 WebView），而不是后端
- API 服务器仍需通过 **Sidecar**（Bun 编译的二进制文件）承载
- 将 `bun build --compile` 将 API 服务器编译为单文件二进制，随 Tauri 分发
- Rust 仅用于 Tauri 的主进程和 IPC 桥接，不需要重写现有后端代码

#### Tauri 可行性的前提

1. 先完成 Node.js → Bun 迁移（确保后端在 Bun 下稳定运行）
2. 用 `bun build --compile` 编译 API 服务器为二进制
3. 初始化 Tauri，配置 Sidecar 启动 API 服务
4. 前端适配 Tauri 运行时检测、API URL 切换、原生对话框

---

### 四、推荐路径

#### 短期（如果只需要更快的开发体验）
- ✅ 安装 Bun，用 `bun install` 替代 `pnpm install`​（`bun.lock` 自动生成，原 pnpm-lock 不受影响）
- ✅ `tsx watch` → `bun --watch`
- ✅ Vite 脚本加 `--bun` 标志
- ⚠️ 验证 Mastra Agent 流式响应在 Bun 下是否正常

#### 中期（如果需要桌面应用）
- 完成 Bun 迁移并稳定运行
- 用 `bun build --compile` 编译 API 服务器
- 引入 Tauri v2，配置 Sidecar 架构
- 将 Web 前端构建产物嵌入 Tauri

#### 不做迁移也合理的理由
- 当前 Node.js + pnpm 栈运行良好
- pnpm 的隔离 node_modules 和 `pnpm-lock.yaml` 的可读性是实际工程优势
- Mastra 对 Bun 的兼容性未经充分验证（尤其是流式响应）
- 迁移本身有工程成本，但用户可见收益有限（除非要打包桌面应用）

综上所述，如果主要目的是**打包桌面应用**，路径是 "Bun 编译二进制 → Tauri sidecar"；如果只是为了**提升开发体验**，收益不足以覆盖迁移成本和风险。建议优先验证 Mastra 在 Bun 下的流式响应兼容性，再做最终决定。
