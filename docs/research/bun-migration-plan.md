# Node.js → Bun 迁移方案

> **2026-06-16 更新：决策已逆转。本项目已完成 Bun → Node.js 的全量迁移，当前使用 pnpm + Node.js。**
> 保留此文件作为历史记录。

> 基于 @mastra/core v1.41.0、Hono v4、Vite 8、TanStack Router v1 + Query v5 官方文档分析。

## 一、当前架构总览

```
feedmind/
├── apps/
│   ├── api/        Hono + Mastra Agent + Drizzle/SQLite + Wiki/Crawler
│   └── web/        Vite 8 + React 19 + TanStack Router + Query v5
├── packages/       5 个内部包（纯 TS，零原生依赖）
└── data/           SQLite + Wiki 文件
```

**关键约束：** 项目使用**零原生模块**（无 better-sqlite3、sharp、prisma、node-gyp），这是迁移可行性最大的利好因素。

---

## 二、迁移策略：双轨并行

不一次性全部切换。分为两个阶段：

| 阶段 | 范围 | 目标 |
|---|---|---|
| **Phase 1** | 仅 API (apps/api) | Bun 运行时 + `hono/bun`，保留 pnpm + Node.js 给 Web |
| **Phase 2** | 全线 Bun | api + web 都切到 Bun，为 Tauri 做准备 |

### Phase 1 架构（过渡期）

```
┌──────────────┐     pnpm dev      ┌──────────────┐
│  Web (Vite)  │ ←───────────────→ │  API (Bun)   │
│  Node.js     │    proxy /api     │  hono/bun    │
│  pnpm        │                   │  bun install  │
└──────────────┘                   └──────────────┘
```

互不影响，单独验证 API 的兼容性。

### Phase 2 架构（全线迁移 + Tauri）

```
┌──────────────┐     HTTP          ┌──────────────────────┐
│  Web (Bun)   │ ←───────────────→ │  API (Bun)           │
│  bun install │    localhost      │  bun build --compile  │
│  Vite 8 + Bun│                   │  → feedmind-api 二进制 │
└──────┬───────┘                   └──────────┬───────────┘
       │                                       │
       └────────── Tauri Desktop ──────────────┘
       Web 前端嵌入系统 WebView      API 作为 Sidecar 进程
```

---

## 三、Phase 1：API 迁移（已验证可行）

### 3.1 安装 Bun

```bash
# Windows (PowerShell)
powershell -c "irm bun.sh/install.ps1|iex"

# 验证
bun --version  # ≥ 1.2.x
```

### 3.2 在 API 子目录独立安装依赖

```bash
cd apps/api
bun init  # 会在 apps/api 下生成 bun.lock + node_modules
bun install
```

> 注意：不与 root 的 pnpm workspace 共享 node_modules。API 子目录独立锁定。

### 3.3 替换 `@hono/node-server` → `hono/bun`

**`apps/api/src/server.ts`**（直接影响）：

```typescript
// 删除
import { serve } from "@hono/node-server";

// 新增
import { serve } from "hono/bun";
```

⚠️ **关键验证点：** `@mastra/hono` 的 `MastraServer` 使用 `@hono/node-server` 作为 peer dependency。迁移到 `hono/bun` 后，需要确认 MastraServer 的 requestContext 中间件初始化正常。实测路径：

```
MastraServer.init()
  → app.use("*", middleware)       // 正常
  → serve({ fetch: app.fetch })   // 替换为 hono/bun
  → Bun.serve() 原生运行
```

`MastraServer` 不直接依赖 `@hono/node-server`——它只是接收 Hono `app` 实例。`serve` 的替换是独立的。

### 3.4 替换 tsx → bun --watch

**`apps/api/package.json`**：

```json
{
  "scripts": {
    "dev": "bun --watch src/server.ts",
    "build": "tsc -b && cp -r src/mastra/skills dist/mastra/skills",
    "start": "bun dist/server.js",
    "typecheck": "tsc -b --pretty false"
  }
}
```

**说明：** `tsc -b` 仍用于 typecheck 和构建——Bun 的开发模式（`bun --watch`）原生支持 TypeScript，但生产构建仍建议用 `tsc` 生成 JS 后分发。

### 3.5 更新 package.json 元信息

```json
{
  "packageManager": "bun@1.2.x",
  "engines": {
    "bun": ">=1.2.0"
  }
}
```

`"type": "module"` 保持不变——Bun 原生支持 ESM。

### 3.6 验证清单

| 检查项 | 方法 | 预期 |
|---|---|---|
| 启动 | `bun --watch src/server.ts` | 正常监听 API:8000 |
| Agent 对话 | 发送 POST 到 /api/agent/chat/feedmind | 流式响应正常 |
| Mastra tool 调用 | 触发 web_search | 返回搜索结果 |
| Wiki 导入 | 触发 ingest worker | 正常轮询 + 处理 |
| 数据库 | 读写操作 | 正常（纯 JS libSQL） |
| 流式 SSE | 监控响应 headers | `text/event-stream` 正常 |
| Crawler | Playwright 操作 | 需单独验证 |

---

## 四、Phase 2：全线迁移

### 4.1 前端（Web）迁移

**前提条件：** 在 Windows 上实测 `bun run --bun vite dev` 的 HMR 表现。如果 HMR 不稳定，Web 保持 Node.js + pnpm，仅 API 走 Bun（Phase 1 架构永久化）。

**迁移步骤：**

```bash
# 1. 在 web 目录独立安装
cd apps/web
bun install

# 2. 更新 dev 脚本
```

**`apps/web/package.json`**：

```json
{
  "scripts": {
    "dev": "bun --bun vite dev --host 127.0.0.1 --port 3000",
    "build": "bun --bun vite build",
    "typecheck": "tsc --noEmit"
  }
}
```

`--bun` 标志告诉 Bun 用自身运行时执行 Vite 的 CLI，否则回退到 Node.js。

**风险：Windows + Bun + Vite 8 的 HMR 可靠性。** Bun 的 `node:fs.watch` 在 Windows 上是 Tier 2 支持，文件变更检测可能延迟或遗漏。这是**唯一可能阻止 Web 迁移的原因**，无法通过代码解决，只能实测。

### 4.2 根目录工程调整

**`package.json`**：

```json
{
  "packageManager": "bun@1.2.x",
  "engines": {
    "bun": ">=1.2.0"
  },
  "scripts": {
    "dev": "bun run build:packages && bun run --parallel --filter @feedmind/api dev --filter @feedmind/web dev",
    "build": "bun run -r build",
    "build:packages": "bun run --filter @feedmind/contracts --filter @feedmind/shared --filter @feedmind/db --filter @feedmind/crawler-core --filter @feedmind/wiki-core build",
    "typecheck": "bun run -r typecheck",
    "test": "bun test"
  }
}
```

**Create `bunfig.toml`**（根目录）：

```toml
[install.scripts]
# 显式信任需要 postinstall 的包（如有）
# trusted = ["esbuild", "..."]
```

Bun 默认不执行生命周期脚本，需显式配置 `trustedDependencies`。

### 4.3 已知兼容性处理

| 原始模式 | Bun 替换 | 影响 |
|---|---|---|
| `process.env` | 完全兼容 | 无影响 |
| `__dirname` / `__filename` | 完全兼容（Bun 自动填充） | 无影响 |
| `import.meta.url` | 完全兼容 | 无影响 |
| `node:fs` / `node:path` | 完全兼容（92%-100% 测试通过） | 无影响 |
| `node:stream` | 完全兼容 | 无影响 |
| `node:crypto` | 完全兼容（次要缺失项不影响本项目） | 无影响 |
| `node:child_process` | 完全兼容（次要缺失项不影响本项目） | 无影响 |
| `stream/web` (Web Streams) | 完全兼容 | Mastra 和 AI SDK 均使用 |
| `node:http` 出站请求 | ✅ 正常（出站请求体缓冲不影响本项目） | 不阻塞 |
| Playwright | Windows 上可能需回退到 Node.js | 需单独验证 |

---

## 五、性能预期

| 指标 | Node.js 24 | Bun 1.2+ | 说明 |
|---|---|---|---|
| API 冷启动 | ~150-300ms | ~5-10ms | Bun 最显著的改进 |
| 日常开发 re-run | 2-4s（tsx watch） | <1s（bun --watch） | 影响开发体验 |
| 包安装（全量） | 30-60s（pnpm） | 3-8s（bun install） | CI 中收益明显 |
| API 吞吐（rps） | 基线 | ~1.5x-2x | Hono 在 Bun 上性能更优 |
| 流式响应延迟 | 基线 | 略优 | 无需 fetch-to-node 桥接 |
| SQLite 查询 | 基线 | 3-6x（bun:sqlite） | 但本项目使用 @libsql/client |
| 测试执行 | 基线 | 2-3x（bun test） | 替换 Vitest 后 |

**关于 `bun:sqlite` 替换 `@libsql/client` 的说明：** `bun:sqlite` 比 `better-sqlite3` 快 3-6x，但本项目使用的是 `@libsql/client`（纯 JS 模式 + Rust neon 绑定）。替换需要改动 Drizzle 的数据库连接层。**建议 Phase 2 以后评估，不做强制要求。**

---

## 六、安全性考量

### 6.1 新增风险

| 风险 | 说明 | 缓解 |
|---|---|---|
| 生命周期脚本不执行 | Bun 默认不运行 postinstall 脚本 | 显式配置 `trustedDependencies` |
| 扁平 node_modules | 丢失 pnpm 的严格隔离，可能引用未声明依赖 | Phase 2 后彻底验证 imports |
| 二进制锁文件 | `bun.lock` 无法在 PR 中 diff | `bun install -y` 生成 `yarn.lock` 辅助 diff |
| JavaScriptCore 引擎 | 与 V8 行为差异（如正则、排序稳定性） | 需全量测试覆盖 |

### 6.2 原有安全策略不受影响

| 机制 | Bun 兼容性 |
|---|---|
| ENCRYPTION_KEY 加密存储 | `node:crypto` 完全兼容 |
| dotenv 加载 | 兼容（或替换为 `bun --env-file`） |
| 本地优先架构 | 不变 |
| API 密钥纯内存使用 | 不变 |

**`dotenv` 替换：** Bun 原生支持 `bun --env-file .env`，无需 `dotenv` 包。`apps/api/src/env.ts` 中的 `loadFeedMindEnv()` 可迁移为：

```typescript
// 之前
import { config } from "dotenv";
config({ path: envFile });

// 之后（Bun 替代）
import { parseEnv } from "bun";
// 或直接在 CLI 层: bun --env-file .env src/server.ts
```

实际上 `dotenv` 在 Bun 上兼容运行，迁移非强制。

---

## 七、Tauri 桌面端路径

### 7.1 可行性

Tauri 无法直接运行 Node.js/Bun 应用。需要一个 **Sidecar 进程**来承载 API 服务器。

### 7.2 推荐的 Sidecar 方案

```
bun build --compile ./apps/api/src/server.ts --outfile feedmind-api
```

这个命令将整个 API 服务器（含 Hono + Mastra + Drizzle）编译为**单文件可执行文件**（~50-80MB），可作为 Tauri 的 Sidecar 分发。

### 7.3 Tauri 配置

```json
// src-tauri/tauri.conf.json（参考）
{
  "build": {
    "frontendDist": "../apps/web/dist",
    "devUrl": "http://localhost:3000"
  },
  "plugins": {
    "shell": {
      "sidecar": [
        {
          "name": "feedmind-api",
          "args": [
            { "name": "--port", "value": "8000" }
          ]
        }
      ]
    }
  }
}
```

### 7.4 启动时序

```
Tauri 应用启动
  → Rust main() 触发 setup hook
  → 用 shell 插件的 sidecar() 方法生成 feedmind-api 进程
  → API 服务在 localhost:8000 启动
  → Tauri WebView 加载前端静态文件
  → 前端检测 __TAURI__ 环境变量
  → 将 API_BASE 设为 http://localhost:8000
  → 正常通信
```

### 7.5 Sidecar 的优势

- **零运行时依赖：** 用户不需要安装 Node.js 或 Bun
- **签名和完整性验证：** Tauri Shell 插件自动验证 Sidecar 二进制
- **跨平台编译：** `bun build --compile` 支持 target 标志

### 7.6 Tauri 的限制

- **Rust 工具链：** 构建桌面端需要安装 Rust（`rustup`）
- **系统 WebView 差异：** macOS（WKWebView）/ Windows（WebView2）/ Linux（WebKitGTK）各有不同
- **前端开发服务器仍需要 Node/Vite：** Tauri dev 模式只是代理到 `devUrl`

---

## 八、不迁移也合理的理由

1. **当前栈已经稳定运行** — Node.js 24 + pnpm 11 是成熟组合
2. **pnpm 的隔离 node_modules 有实际工程价值** — 扁平布局更容易引入隐式依赖
3. **`bun.lock` 二进制不可 diff** — 影响代码审查质量
4. **Windows 上 Vite HMR 是已知风险** — 如果 HMR 不稳定，开发体验不升反降
5. **Mastra 的 Bun 兼容性经过官方确认但未经本项目实测** — 流式响应是核心功能，不容有失
6. **用户可见收益有限** — 启动速度提升（毫秒级）和包安装速度（CI 场景）不直接改善用户体验

## 九、建议路线

```
第 1 步 ─── 安装 Bun，不替换 Node.js
            仅用于实验性验证

第 2 步 ─── Phase 1：API 迁移
            替换 @hono/node-server → hono/bun
            替换 tsx → bun --watch
            独立 bun install（不影响 root pnpm）
            实测流式响应 + Mastra tool 调用

第 3 步 ─── 决策点
            ├── API 稳定 + 流式正常 → 继续 Phase 2
            └── 有问题 → 回退，保持 Node.js

第 4 步 ─── Phase 2：Web 迁移（可选）
            实测 Windows HMR
            通过则全线迁移

第 5 步 ─── Tauri 桌面端（独立路线）
            先 bun build --compile 验证输出
            再引入 Tauri 壳
```

**底线建议：** 先做 Phase 1（API 迁移）作为实验分支，不破坏主分支的 pnpm 工作流。实测 Mastra 流式响应通过后再评估是否推进 Phase 2。Tauri 桌面端是一个独立的加分项，不依赖全线 Bun 迁移——只需 API 能通过 `bun build --compile` 编译即可。
