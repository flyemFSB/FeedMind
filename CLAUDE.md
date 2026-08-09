# CLAUDE.md — FeedMind 项目开发规范

## 项目概述

FeedMind — 知识管理、AI 对话、内容爬取服务平台。基于 pnpm monorepo，包含三个应用和六个共享包。

## 技术栈

```
apps/
  api/       Hono REST API + Mastra AI Agent + OpenAPI (Scalar)
  web/       Vite SPA + React 19 + TanStack Router + Tailwind CSS 4 + Base UI
  desktop/   Electron 桌面壳：内嵌 API，内置 Chromium 供爬虫与 Agent 驱动
packages/
  contracts/    Zod 4 schemas + TypeScript 类型（API 契约单一数据源）
  db/           Drizzle ORM 表定义 + SQLite (libsql)
  env/          环境变量解析与校验（@t3-oss/env-core + zod）
  shared/       纯工具函数、加密（AES/fernet）、日期工具
  wiki-core/    OKF v0.2 文件系统操作（frontmatter、Markdown links、graph、全文搜索）
  crawler-core/ 多平台内容爬虫引擎（小红书、B站、微信读书、知乎）
data/            运行时数据目录（不在仓库中）
  wiki/         Wiki 空间（OKF v0.2 bundle）
  skills/       技能目录
  *.db          SQLite 数据库（feedmind.db、mastra.db 等）
```

## 关键架构决策

- **OKF 文件型 Wiki**：每个空间的 `wiki/` 是 OKF v0.2 bundle，Concept 使用 Markdown + YAML frontmatter，Concept ID 是相对路径去掉 `.md`。`raw/` 和 `.feedmind/` 是 FeedMind 运行时目录，不属于 bundle。数据库存储聊天/爬虫数据，以及 wiki 页面的 FTS5 全文检索索引（派生自文件，可随时重建）。v0.2 信号：`generated: { by, at }`（取代 v0.1 `timestamp`）、`sources`（取代 v0.1 `provenance`，正文不再用 `# Citations`）、`verified`/`status`/`stale_after` 为可选。
- **中文优先**：所有用户界面文本和 Wiki 内容使用中文，通过 react-i18next 支持英文。
- **Mastra Agent**：AI Agent 内嵌于 API 进程（`apps/api/src/mastra/`），使用 `@mastra/core`。通过 `@mastra/ai-sdk` 的 `chatRoute()` 暴露 AI SDK v6 兼容的流式聊天接口。
- **动态模型解析**：Agent 从 `model` 表运行时解析 LLM 模型，通过 `x-feedmind-model-id` 请求头读取用户选中的模型（服务端包装 app.fetch 注入 requestContext）。
- **桌面端 Electron + CDP**：`apps/desktop` 主进程内嵌 API，创建 UI 窗口与两个隐藏标记窗口（`feedmind-crawler`、`feedmind-agent`），通过 `--remote-debugging-port`（默认 9333）暴露 CDP。crawler-core 与 Agent 浏览器用 Playwright `connectOverCDP` 按标记选页驱动内置 Chromium，不再自起 Chrome；连接后校验浏览器身份（UA 含 Electron），拒绝驱动用户主机浏览器。
- **爬虫与 Cookie 认证**：基于 Playwright，Cookie 存于 `cookie_store`，来源为应用内浏览器登录（Electron 打开登录窗口捕获）与微信读书保活（每 30 分钟刷新 skey）。CookieCloud 扩展同步已移除。结果存入 SQLite，输出 RSS。
- **Wiki 导入管道** (`ingest-pipeline.ts`)：两阶段 LLM 管道——阶段一分析源内容为结构化数据，阶段二生成 OKF Concept JSON 并写入 Markdown 文件。
- **运行时配置** (`runtime_config` 表)：存储每个运行时（"session" 聊天、"wiki" 导入）的 LLM 参数。
- **消息持久化**：由 Agent Memory（Mastra `mastra.db`）自动处理，web 端不自行存消息。
- **OpenAPI 文档**：通过 `@hono/zod-openapi` 自动生成 OpenAPI 3.1 规范，Scalar UI 提供交互式文档页面。

## 命令

```bash
pnpm install                   # 安装所有依赖
pnpm run dev                   # 构建共享包后并行启动 api + web
pnpm run desktop:dev           # 构建后启动 desktop（Vite + Electron）
pnpm run desktop               # 生产构建并启动桌面应用
pnpm run build                 # 构建所有包和应用
pnpm run build:packages        # 仅构建共享包
pnpm run typecheck             # 全仓库 TypeScript 类型检查
pnpm run lint                  # 全仓库 ESLint 检查
pnpm run test                  # 运行所有测试（vitest）
pnpm run db:push               # drizzle-kit push 同步 schema（改 schema 后执行）
pnpm run db:init               # 写入种子数据（工具配置、默认运行配置，首次使用或重置后执行）
pnpm run db:reset              # 重置数据库
pnpm run web:dev               # 仅前端（http://localhost:13790）
pnpm run api:dev               # 仅 API + Mastra Agent（http://localhost:18790）
```

## API 路由

所有路由位于 `/api/v1` 下：

| 路由                | 功能                                                  |
| ------------------- | ----------------------------------------------------- |
| `GET /health`       | 健康检查（含数据库连接状态）                          |
| `models`            | LLM 模型 CRUD + 选中                                  |
| `runtime-configs`   | 运行时配置读写                                        |
| `chats`             | 聊天会话 CRUD                                         |
| `tools`             | 工具配置 CRUD                                         |
| `wiki/*`            | Wiki 空间/页面/源/导入/图谱/审查/lint                 |
| `crawler/*`         | 爬虫任务和结果（含 RSS 输出）                         |
| `skills`            | 技能列表/安装/删除                                    |
| `remote-connection` | 远程连接（飞书等）接入                                |
| `cookiecloud`       | Cookie 管理（登录/校验/手动保存；历史前缀保留）       |
| `rss-sources`       | RSS 源 CRUD                                           |
| `feeds`             | 信息流条目读取/已读/同步                              |
| `openapi`           | OpenAPI 3.1 JSON 规范（`@hono/zod-openapi` 自动生成） |
| `docs`              | Scalar 交互式 API 文档 UI                             |

Agent 聊天路由：`/api/chat/:agentId`（前端）→ Vite dev proxy 重写为 `/v1/agent/chat/:agentId`（后端）。

## 开发规范

### 实施规范

1. **动手前先联网调研**：当实现涉及已有技术栈的功能时，必须先联网获取相关库/框架/工具的最新官方文档、API 变更、推荐实践，确保实现方案基于最新版本。联网工具分工如下（避免使用内置 `WebSearch` / `WebFetch`，其对文档类查询的精度与内容质量不足）：
   - 查库/框架技术文档 → **context7**（MCP `query-docs`）
   - 网络/网页搜索 → **exa**（`exa:search` / `exa:web_search_exa`）
   - 抓取网页内容 → **Firecrawl**（`firecrawl:firecrawl-scrape`，JS 渲染与结构化 markdown 更可靠）
2. **Ponytail 原则**：用最懒但能用的方案。YAGNI——不做不需要的功能；优先用标准库/原生 API，不引入新依赖；一行能搞定不用五十行。不搞过度工程、不写死路径灵活、不做未来假设。
3. **中文注释**：所有代码注释使用中文。遵循"注释说 WHY 不说 WHAT"原则——代码本身应自文档化，注释解释设计决策、边界条件、workaround 原因。
4. **中文日志**：所有日志消息使用中文，结构化字段名使用英文。
5. **中文回复**：与用户的交流、思考过程展示、代码评审等全部使用中文。
6. **注释中不写 `ponytail:`**：简化的意图直接写在注释正文中，不需要加 `ponytail:` 前缀标记。
7. **每次回答前调用 ponytail plugin**：通过 Skill 工具调用 `ponytail:ponytail` 技能，确保 Ponytail 原则在每个回答中生效。

### 注释规范（Google Engineering Practices）

遵循 Google Engineering Practices Documentation（https://google.github.io/eng-practices/）：注释只解释 WHY 与非显然行为（设计决策、边界条件、workaround、坑），纯复述代码的 WHAT 注释、显而易见或过时/与代码不符的注释一律删除；保留 TODO/FIXME、安全说明、单位/格式澄清。

判断一条注释是否有必要：删掉它后读者是否仍能看懂、且不丢失关键信息。能删就删，不为注释而注释。

### 提交规范

- **约定式提交**：遵循 Conventional Commits 规范
  ```
  feat(scope): 添加用户登录功能
  fix(api): 修复健康检查超时问题
  chore(deps): 升级 pino 到 v10
  docs(readme): 更新 API 文档链接
  refactor(ingest): 提取公共解析逻辑
  test(contracts): 补充 Zod schema 测试
  style(eslint): 启用 no-floating-promises 规则
  perf(worker): 优化缓存策略
  ```
- **husky pre-commit**：自动运行 `lint-staged`（prettier 格式化）
- **husky commit-msg**：自动运行 `commitlint` 校验提交信息格式
- **推送前**：运行 `pnpm run typecheck && pnpm run lint` 确保无错误

### 分支与版本规范

- **分支工作流**：采用 Trunk-based 简版——`main`（`master`）始终可发布。单人协作直接提交主分支；多人协作时用短命功能分支（建议 < 2 天）+ PR 合并，不引入 Git Flow 的长期 `develop`/`release` 分支（对持续部署的 web/desktop 收益为负）。
- **分支命名**：`type/scope` 前缀，与 Conventional Commits 类型对齐：`feat/`、`fix/`、`hotfix/`、`refactor/`、`docs/`、`chore/`、`release/`（如 `fix/weread-cookie-expiry`、`feat/wiki-graph`）。
- **语义化版本（SemVer）**：共享包与桌面端版本遵循 `MAJOR.MINOR.PATCH`——`BREAKING CHANGE` 升主版本、向后兼容的新功能升次版本、修复升补丁版本；版本号写入各 `package.json`，禁止无意义 bump。

### 代码评审规范（Google Code Review）

遵循 Google Code Review 实践（https://google.github.io/eng-practices/）：

- 变更（CL/PR）小而自包含：一个 CL 只做一件事，并附带相关测试；评审拖太久就拆小
- 评审关注点按优先级：**设计 → 功能正确性 → 复杂度 → 测试 → 命名 → 注释 → 风格 → 文档**
- 评审者指出具体问题（文件/行号）并给出理由；不阻塞在个人风格偏好上

### 代码格式化 (Prettier + EditorConfig)

- `printWidth: 100`，2 空格缩进
- 尾逗号（trailing comma），LF 换行
- `.editorconfig` 统一跨 IDE 行为
- `.gitattributes` 确保跨平台换行符一致

### ESLint 规则

| 规则                          | 级别  | 说明                                  |
| ----------------------------- | ----- | ------------------------------------- |
| `no-explicit-any`             | warn  | 避免随意使用 any                      |
| `no-unused-vars`              | warn  | `_` 前缀豁免                          |
| `consistent-type-imports`     | error | 强制 `import type`                    |
| `no-floating-promises`        | error | 禁止未处理的 Promise                  |
| `no-misused-promises`         | error | 禁止 Promise 误用                     |
| `await-thenable`              | error | 确保 await 仅用于 Promise             |
| `prefer-nullish-coalescing`   | warn  | 鼓励 `??` 替代 `\|\|`                 |
| `prefer-optional-chain`       | warn  | 鼓励 `?.` 替代 `&&`                   |
| `react-hooks/rules-of-hooks`  | error | 强制 Hooks 顶层调用（React 官方规则） |
| `react-hooks/exhaustive-deps` | warn  | 校验 useEffect 依赖数组               |

API 和 Web 子包启用了 `parserOptions.projectService: true` 支持类型感知检查（typed linting）。

ESLint 以 `typescript-eslint` 的 `recommended` 预设起步，API/Web 在其上叠加上述规则。对数据边界（爬虫响应、LLM 输出、外部 API）相关新代码，鼓励补充 typed 规则 `@typescript-eslint/no-unsafe-*` 系列以捕获隐式 `any`。**格式一律交给 Prettier**，不用 ESLint 格式化规则。

### React 规范（官方 Rules of React）

- 遵循 React 官方 Rules of Hooks（https://react.dev/reference/rules）：Hooks 只在组件/Hook 顶层调用，禁止在循环、条件、嵌套函数、事件回调、`try/catch` 中调用
- 通过 `eslint-plugin-react-hooks` 强制 `rules-of-hooks`（error）+ `exhaustive-deps`（warn）
- 自定义 Hook 以 `use` 前缀命名、单一职责；副作用放 `useEffect`，派生值用 `useMemo`/`useCallback`，状态更新用 `useState`
- 函数组件优先于类组件；组件 props 显式声明类型

### TypeScript 严格度

全部子项目继承 `tsconfig.base.json`，启用 TS 官方推荐的 strict 家族选项（各选项与 `strict` 独立，需显式开启）：

- `strict: true` + `noUnusedLocals` + `noUnusedParameters`
- `noImplicitOverride`：类方法重写必须写 `override`
- `noImplicitReturns`：所有代码路径必须显式返回
- `noFallthroughCasesInSwitch`：禁止 switch 分支穿透
- `noUncheckedIndexedAccess`：数组/索引签名访问返回 `T | undefined`，越界需显式处理
- `exactOptionalPropertyTypes`：可选属性不能显式赋 `undefined`，需省略键或条件展开 `...(x !== undefined ? { x } : {})`
- `noPropertyAccessFromIndexSignature`：索引签名对象用 `obj["key"]`，禁止 `obj.key`
- `verbatimModuleSyntax`：编译器层强制 `import type`，与 ESLint `consistent-type-imports` 双保险
- `allowUnreachableCode: false`

- 运行时：`target: ES2025` + `lib: ES2025` + `module: NodeNext`（api/desktop/packages），对齐 Node ≥24 的 V8 13.6 支持范围（含 `Promise.withResolvers`、Iterator helpers、`using`、`Set.prototype.union` 等）；web 是 Vite SPA，用 `module: esnext` + `moduleResolution: bundler`，同样继承全部严格选项
- `declarationMap: true`，方便 IDE 导航到源码

> 注：`noUncheckedIndexedAccess` / `exactOptionalPropertyTypes` / `noPropertyAccessFromIndexSignature`
> 对存量代码有迁移成本，历史代码已适配；新代码必须遵守。仅在边界条件保证下标存在时才用 `!`。

### 命名规范

- **文件命名**：kebab-case（`page-store.ts`、`ingest-worker.ts`）
- **变量/函数**：camelCase
- **类/类型/接口**：PascalCase
- **未使用参数**：`_` 前缀（`_signal`、`_category`）

### 日志规范

- 使用 `pino` 结构化日志，通过 `import { logger } from "../../lib/logger.js"` 引用
- 级别映射：`fatal`（进程退出）→ `error`（需人工关注）→ `warn`（可恢复降级）→ `info`（正常事件）
- 敏感字段自动脱敏（`apiKey`、`password`、`cookies`、`authorization`）
- 数据库包使用 `dbLogger`（`packages/db/src/logger.ts`）
- 主动丢弃 Promise 时使用 `void` 操作符

### 错误处理

- API 层业务错误使用 `HttpError`（`lib/http.ts`）
- 重新抛出捕获的异常时传递 `{ cause: err }`（符合 `preserve-caught-error` 规则）
- 错误日志使用结构化字段：`logger.error({ err, taskId }, "描述")`

### 安全规范

- **信任边界校验**：对外部输入（用户请求、爬虫响应、LLM 输出、RSS/网页内容）一律按不可信处理，先做类型/长度校验再使用
- **SSRF 防护**：抓取类工具必须校验目标 URL，拒绝内网/私有 IP 段（参考 `web-fetch.ts` 的 `checkSSRF`）
- **密钥管理**：API Key 等敏感数据加密落库（AES，`@feedmind/shared`）；禁止硬编码、禁止提交 `.env`
- **依赖审计**：定期运行 `pnpm audit` 检查已知漏洞

### OpenAPI 文档

- 使用 `@hono/zod-openapi` 定义带文档的路由：`createRoute()` → `openapiApp.openapi()`
- 路由定义和 handler 分离，handler 中返回类型需要显式标注
- 所有新路由优先使用 `OpenAPIHono` + `createRoute` 模式

### 目录结构约定

```
apps/
  api/src/
    lib/          通用工具（http、logger、openapi）
    routes/v1/    Hono 路由定义 + OpenAPI 注册
    modules/      业务逻辑服务（按模块分包）
    mastra/       Mastra Agent（agents、tools、subagents、prompts、scorers、vector-store）
  web/
    src/routes/   TanStack Router 文件路由
    components/   UI 组件
    lib/          api 客户端、hooks、i18n
  desktop/src/    Electron 主进程（main.ts）
packages/
  contracts/    Zod schema + TypeScript types（契约单一数据源）
  shared/       纯工具函数、加密、常量
  db/           数据库 schema + 客户端初始化
  env/          环境变量解析与校验
  wiki-core/    Wiki 文件系统引擎
  crawler-core/ 爬虫引擎（core + routes）
```

### 依赖管理

- 使用 `pnpm@11` + workspace 协议（`workspace:*`）
- 跨包共享依赖版本通过 `pnpm-workspace.yaml` 的 `catalog` 管理
- 原生依赖通过 `allowBuilds` 放行构建（electron、esbuild 等）；`drizzle-orm`/`@libsql/client` 走 `publicHoistPattern` 供 drizzle-kit 解析
- 依赖更新通过 `.github/dependabot.yml` 自动化（如已配置）

### 测试策略

- 使用 `vitest` 作为测试框架
- 测试文件放在源文件同级：`*.test.ts`
- 编写测试优先覆盖 `packages/contracts` 的 Zod schema 验证
- 集成测试使用内存 SQLite，避免外部依赖
- **修复必带回归测试**；按测试金字塔分配：契约/纯函数（包级）优先，覆盖边界条件

### 实施检查清单

实现新功能前依次确认：

1. [ ] 联网调研涉及的技术栈官方最新文档
2. [ ] 遵循 kebab-case 文件命名
3. [ ] 为公开 API 添加 JSDoc 说明
4. [ ] 添加中文 "why" 注释（而非 "what" 注释）
5. [ ] 使用中文日志消息 + 结构化字段
6. [ ] 正确使用日志级别（error/warn/info）
7. [ ] 捕获异常时传递 `{ cause: err }`
8. [ ] 使用 `import type` 分离类型导入
9. [ ] 路由优先使用 `@hono/zod-openapi` 模式
10. [ ] 运行 `pnpm run typecheck && pnpm run lint` 确保无错误
11. [ ] React 组件遵守 Rules of Hooks（Hooks 只在顶层调用）
12. [ ] 可选属性按 `exactOptionalPropertyTypes` 处理（undefined 时条件展开省略）
13. [ ] 索引访问显式判空；仅当下标保证存在时才用 `!`
