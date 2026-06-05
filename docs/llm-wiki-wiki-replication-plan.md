# FeedMind 复刻 llm_wiki Wiki 功能计划（精简版）

> 调研日期：2026-06-05
> 目标：在 FeedMind 中实现完整的本地文件 Wiki 功能
> 约束：不涉及数据库、向量检索、图片提取；页面类型仅限 entity/concept/source/overview

## 1. 架构总览

FeedMind 的 Wiki 是一个本地文件 vault，API、Agent、Web 只是读写和编排层。

```
data/wiki/<spaceId>/
├── space.json               # FeedMind 空间元数据
├── purpose.md               # Wiki 目标（LLM 上下文）
├── schema.md                # 页面类型和路由规则
├── raw/sources/             # 原始文档
│   └── .cache/              # 预处理缓存
├── wiki/
│   ├── index.md             # 页面索引（LLM 自动维护）
│   ├── log.md               # 操作日志
│   ├── overview.md          # 全局概览
│   ├── entities/            # 实体页面
│   ├── concepts/            # 概念页面
│   └── sources/             # 来源摘要页面
└── .llm-wiki/
    ├── project.json         # 稳定 project ID
    ├── ingest-queue.json    # Ingest 队列
    ├── ingest-cache.json    # Ingest 缓存
    ├── review.json          # Review 项
    ├── lint.json            # Lint 结果
    ├── page-history/        # 页面合并备份
    └── graph-visibility.json # 图谱 dismissals
```

**新增包**：`packages/wiki-core` — 纯 TS，不依赖 React/Hono/DB，被 API 和 Agent 共同使用。

## 2. 页面类型

仅四种类型，由 `type` frontmatter 字段区分：

| 类型 | 目录 | 说明 |
|---|---|---|
| entity | `wiki/entities/` | 人、组织、产品、工具等命名实体 |
| concept | `wiki/concepts/` | 理论、方法、技术、现象等抽象概念 |
| source | `wiki/sources/` | 原始文档的摘要页面（ingest 自动生成） |
| overview | `wiki/overview.md` | 全局概览（ingest 自动更新） |

每个 `.md` 文件以 YAML frontmatter 开头：

```yaml
---
type: concept
title: 概念名称
created: 2026-06-05
updated: 2026-06-05
tags: []
related: [slug-a, slug-b]
sources: ["source-file.pdf"]
---
```

正文使用 `[[slug]]` 或 `[[slug|别名]]` 进行交叉引用。

## 3. Ingest 队列

队列文件 `.llm-wiki/ingest-queue.json`：

```json
{
  "id": "ingest-xxx",
  "projectId": "<spaceId>",
  "sourcePath": "raw/sources/papers/report.pdf",
  "folderContext": "papers",
  "status": "pending",
  "addedAt": 1780630000000,
  "error": null,
  "retryCount": 0
}
```

规则：
- 同一 source 的 pending/failed 任务不重复入队
- 每个空间同时只处理一个 ingest（project lock）
- 失败最大重试 3 次，支持手动重试
- 取消时删除本次已写文件，避免半成品污染
- 队列 drain 后扫描 review items，自动解决已不成立的项

## 4. Ingest 缓存

缓存文件 `.llm-wiki/ingest-cache.json`，以 source identity 为 key：

- 保存 SHA256、timestamp、已写文件列表
- source 内容未变且所有文件仍存在 → 跳过 LLM ingest
- 文件丢失 → 缓存失效，重新 ingest
- 删除 source 时同步清除缓存

## 5. 两阶段 LLM Ingest

### Stage 1：Analysis

LLM 读取 source + purpose + schema + index，输出结构化分析：

```
- Key Entities（关键实体）
- Key Concepts（关键概念）
- Main Arguments & Findings（主要论点）
- Connections to Existing Wiki（与现有 Wiki 的关联）
```

### Stage 2：Generation

LLM 读取 analysis 和上下文，输出 **FILE blocks**：

```text
---FILE: wiki/concepts/example.md---
---
type: concept
title: Example
created: 2026-06-05
updated: 2026-06-05
tags: [example]
related: []
sources: ["source.md"]
---

# Example

正文内容…
---END FILE---
```

生成的页面：
1. **source summary**（`wiki/sources/<slug>.md`）
2. **entity pages**（`wiki/entities/`）
3. **concept pages**（`wiki/concepts/`）
4. **更新 `wiki/index.md`**（保留现有条目+追加新条目）
5. **更新 `wiki/log.md`**（追加日志）
6. **更新 `wiki/overview.md`**（重写全局概览）

### FILE block 解析安全

- 拒绝空路径、绝对路径、`..`、Windows 保留名、控制字符
- 只允许写入 `wiki/` 下的路径
- 兼容 CRLF、大小写变体、fenced code block 内 marker
- 未闭合 block 产生 warning 而不是静默丢弃
- 生成内容清理常见 LLM 错误（外层代码块、frontmatter 前缀等）

### 页面合并

- `sources/tags/related` 做确定性 union 合并
- `type/title/created` 是 locked fields，新 ingest 不能覆盖已有值
- body 不一致时调用 LLM 合并
- LLM 合并后 body 比最短输入短 70% 以上 → 拒绝并回退
- 回退前备份旧页面到 `.llm-wiki/page-history/`

### 长文档处理

- 按 Markdown 标题/段落切分为语义块
- 每块独立分析，汇总为 global digest
- Generation 使用 digest + chunk analyses，不把全文塞进上下文
- 检查点保存在 `.llm-wiki/ingest-progress/`，失败后可恢复

## 6. 多格式文档摄入

### 支持的格式

第一阶段（无需额外库）：`.md`, `.txt`, `.html`, `.csv`, `.json`, `.yaml`

第二阶段引入 `officeparser`：PDF, DOCX, PPTX, XLSX, ODT, ODP, ODS, RTF

### 处理流程

1. 原始文件保存到 `raw/sources/`
2. Node importer 将各种格式转换为 normalized Markdown
3. normalized Markdown 进入两阶段 LLM ingest pipeline
4. 预处理文本缓存到 `raw/sources/.cache/`

## 7. Source 生命周期与删除级联

### 删除流程

删除 source 时：

1. 删除原始文件 + 预处理缓存 + ingest cache
2. 扫描所有 wiki 页面的 frontmatter `sources` 字段
3. 仅引用该 source 的页面 → **删除**
4. 多 source 页面 → **移除该 source 引用**，保留页面
5. 清理 `index.md` 中指向已删页的条目
6. 清理正文中的 `[[已删页面]]` 为纯文本
7. 清理 `related` 字段中的死引用
8. 追加 `log.md` 删除记录

### 删除前展示影响

UI 展示：
- 将删除哪些页面
- 将保留但移除 source 引用的共享页面
- 将清理的链接数量

## 8. 搜索

纯 keyword 搜索（无向量）：

- 英文按词切分 + stop words 过滤
- CJK 生成 bigram + 单字 token
- 权重：filename 精确 > title 包含短语 > body 短语 > token 匹配
- snippet 从命中位置截取上下文
- 搜索范围：`wiki/**/*.md`

### Graph expansion

检索流程：
1. keyword search top N
2. 通过 graph relevance 扩展相关页面
3. 低于阈值的丢弃
4. 合并去重，按 keyword score + graph relevance 排序

## 9. 知识图谱与 Louvain 社区检测

### 图谱构建

Node 属性：id, label, type, path, linkCount, community

Edge 来源：
- `[[wikilink]]` 交叉引用
- 共享 frontmatter `sources`

### 四信号 Relevance

| 信号 | 权重 | 说明 |
|---|---|---|
| Direct link | 3.0 | A 引用 B 或 B 引用 A |
| Source overlap | 4.0 | 共享相同的原始文档 |
| Common neighbor | 1.5 | 共同邻居（Adamic-Adar） |
| Type affinity | 1.0 | entity ↔ concept 等类型亲和度 |

### Louvain 社区检测

- 使用 `graphology` + `graphology-communities-louvain`
- Edge weight = relevance score
- 输出 community assignment + cohesion（内部边密度）
- Cohesion < 0.15 的社区标记为稀疏

### Graph Insights

- **Surprising connections**：跨社区/跨类型的边
- **Isolated pages**：度 ≤ 1 的节点
- **Sparse communities**：内部链接不足的聚类
- **Bridge nodes**：连接 3 个以上社区的节点

### 可视化

使用 `sigma.js` + `@react-sigma/core`：
- Type 色彩模式 / Community 色彩模式
- ForceAtlas2 布局（大图走 Web Worker）
- 搜索、hover 高亮、缩放
- Insights 侧边面板

## 10. Review 与 Lint

### Review Items

文件 `.llm-wiki/review.json`，类型：
- `missing-page`：重要概念尚无页面
- `duplicate`：可能重复的实体/概念
- `contradiction`：页面间存在矛盾
- `suggestion`：值得探索的方向

Ingest 输出 REVIEW blocks 自动进入 review store。支持 dedupe、dismiss、Create Page、Deep Research。

### Structural Lint

扫描检查：
- 不合法 frontmatter
- broken `[[wikilink]]`
- orphan page（无入链）
- no-outlink 页面
- `related` 指向不存在的页面
- index listing 与实际文件不一致

### Semantic Lint

LLM 读取 wiki 摘要后输出 LINT blocks，发现 contradiction、stale page、missing page。

## 11. 前端工作台

视图：

| 视图 | 说明 |
|---|---|
| **Pages** | 页面树 + Markdown Reader/Editor + Backlinks |
| **Sources** | 来源列表、上传文件、URL、查看 ingest 状态 |
| **Activity** | Ingest 队列进度、取消、重试 |
| **Search** | 关键词搜索 + 图谱扩展结果 |
| **Graph** | 知识图谱可视化 + Insights |
| **Review** | Review 收件箱 |
| **Lint** | 检查结果面板 |

### 交互要点

- Reader 中 `[[wikilink]]` 渲染为可点击链接
- Editor 保存原始 wikilink 文本
- Graph 中点击节点打开对应页面
- 删除 source 前展示影响面

## 12. 模块划分

```
packages/wiki-core/           # 纯 TS 核心库
├── src/
│   ├── paths.ts              # 安全路径操作
│   ├── frontmatter.ts        # YAML frontmatter 解析/序列化
│   ├── wikilinks.ts          # Wikilink 提取/解析
│   ├── source-identity.ts    # Source 身份/别名生成
│   ├── ingest-cache.ts       # 缓存读写
│   ├── ingest-queue.ts       # 队列状态管理
│   ├── file-blocks.ts        # FILE block 解析 + 路径安全
│   ├── page-merge.ts         # 页面合并
│   ├── source-lifecycle.ts   # Source 删除级联
│   ├── cleanup.ts            # Index/wikilink/related 清理
│   ├── lint.ts               # Structural lint
│   ├── graph.ts              # 图谱构建 + Louvain
│   ├── graph-insights.ts     # Insights 检测
│   └── search.ts             # Keyword 搜索 + CJK tokenizer

apps/api/src/modules/wiki/    # HTTP API 层
apps/agent/src/wiki/          # Agent ingest/merge/lint 编排
apps/web/components/wiki/     # React 组件
```

## 13. 分阶段实施

### M1：文件 vault 基础
- 新建 `packages/wiki-core`
- 统一 `data/wiki/` 空间结构
- safe path、frontmatter、atomic write
- API 迁移到 wiki-core

### M2：Page/Sources UI
- Page tree + Reader/Editor
- Backlinks 展示
- Sources 列表 + text/md 导入
- 页面 CRUD 端点

### M3：Ingest 队列 + 缓存
- 队列 JSON 持久化
- 缓存 JSON
- enqueue/retry/cancel
- Activity panel
- Project lock

### M4：两阶段 LLM Ingest
- Analysis/Generation prompts
- FILE block 解析
- 页面合并
- Source summary 固定路径
- Review items 持久化
- Agent ingest 编排

### M5：多格式文档摄入
- 引入 `officeparser`
- PDF/DOCX/PPTX/XLSX → normalized Markdown
- 长文档分块 + checkpoint

### M6：Source 删除级联
- delete 前 impact preview
- detach / delete-orphans
- Index/wikilink/related 清理
- Log 追加

### M7：搜索 + Agent tools
- Keyword search + CJK tokenizer
- Graph expansion
- Agent wiki_read/wiki_search tools

### M8：知识图谱 + Louvain
- Graph API
- Relevance 计算
- Community detection
- Sigma.js 可视化
- Insights 面板

### M9：Review + Lint
- Review 收件箱操作
- Structural lint
- Semantic lint
- Review sweep

## 14. 测试策略

### Unit tests（核心覆盖）
- 安全路径：绝对路径、`..`、Windows 保留名、控制字符
- FILE parser：CRLF、大小写、fenced code、未闭合
- Frontmatter parse/stringify
- Wikilink 提取（跳过 code block）
- Page merge：array union、locked fields、70% fallback
- Ingest cache：hit/miss/file missing
- Source delete：cascade/keep/cleanup
- CJK tokenizer
- Graph relevance 和 cohesion

### Integration tests
- 创建空间后目录完整
- 单个 source ingest 生成多页
- 重复 ingest 合并页面
- 删除 source 级联清理
- 长文档 checkpoint restore
- Graph API 返回 nodes/edges/communities

## 15. 风险

| 风险 | 处理 |
|---|---|
| 并发写导致 index/log 丢更新 | Project lock + atomic write |
| LLM 输出路径穿越 | FILE parser 强校验，只允许 `wiki/` |
| LLM merge 丢内容 | 70% shrink 检查 + page-history 备份 |
| 大文件 token 成本 | SHA256 cache + 语义切块 + checkpoint |
| Source 删除误伤 | 删除前 impact preview，默认 detach |
| Graph 大图卡顿 | Worker layout + WebGL + 过滤 |
| Web/Agent 同时写文件 | 统一 wiki-core lock |


## 调研来源索引

- `E:\PycharmProjects\llm_wiki\src\lib\ingest.ts` — 两阶段 ingest pipeline
- `E:\PycharmProjects\llm_wiki\src\lib\wiki-graph.ts` — 图谱构建 + Louvain
- `E:\PycharmProjects\llm_wiki\src\lib\graph-relevance.ts` — 四信号 relevance
- `E:\PycharmProjects\llm_wiki\src\lib\graph-insights.ts` — Surprising connections / knowledge gaps
- `E:\PycharmProjects\llm_wiki\src\lib\source-lifecycle.ts` — Source 删除级联
- `E:\PycharmProjects\llm_wiki\src\lib\wiki-cleanup.ts` — Index/wikilink 清理
- `E:\PycharmProjects\llm_wiki\src\lib\lint.ts` — Structural + semantic lint
- `E:\PycharmProjects\llm_wiki\src\lib\search.ts` — Keyword 搜索
- `E:\PycharmProjects\llm_wiki\src-tauri\src\commands\search.rs` — Rust 搜索实现
- `E:\PycharmProjects\llm_wiki\src\lib\page-merge.ts` — 页面合并策略
- `E:\PycharmProjects\llm_wiki\src\lib\ingest-queue.ts` — 队列实现
- `E:\PycharmProjects\llm_wiki\src\lib\ingest-cache.ts` — 缓存实现
- `E:\PycharmProjects\llm_wiki\src\lib\text-chunker.ts` — 文本分块
- `E:\PycharmProjects\llm_wiki\src\lib\wiki-page-types.ts` — 页面类型定义
