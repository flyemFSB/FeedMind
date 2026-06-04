# MediaCrawler → FeedMind TypeScript 复刻实施方案

> 将 MediaCrawler（Python）的社交平台爬虫能力以 TypeScript 方式复刻到 FeedMind monorepo 中。

---

## 一、设计原则

| 做 | 不做 |
|---|------|
| 7 个平台爬取核心 | ❌ 不爬评论/子评论 |
| SQLite 持久化（Drizzle ORM） | ❌ 无 CSV/JSON/Excel/MongoDB |
| Cookie 登录（外部传入） | ❌ 无 QR/手机登录 |
| Playwright 浏览器自动化 | ❌ 无验证码识别 |
| RESTful API（Hono）控制爬虫 + 查询数据 | ❌ 无前端页面 |
| 可选静态代理 | ❌ 无代理池/缓存 |

---

## 二、项目结构

```
FeedMind/
├── packages/
│   ├── crawler-core/              # [新增] 爬虫引擎
│   │   ├── src/
│   │   │   ├── core/
│   │   │   │   ├── abstract-crawler.ts     # 爬虫抽象基类
│   │   │   │   ├── abstract-api-client.ts  # API 客户端抽象
│   │   │   │   ├── abstract-store.ts       # 存储抽象
│   │   │   │   ├── factory.ts              # CrawlerFactory
│   │   │   │   └── types.ts               # 平台枚举、统一类型
│   │   │   ├── platforms/
│   │   │   │   ├── xhs/           # 小红书
│   │   │   │   ├── douyin/        # 抖音
│   │   │   │   ├── bilibili/      # B站
│   │   │   │   ├── weibo/         # 微博
│   │   │   │   ├── zhihu/         # 知乎
│   │   │   │   ├── kuaishou/      # 快手
│   │   │   │   └── tieba/         # 贴吧
│   │   │   └── store/
│   │   │       └── db-store.ts    # Drizzle 写入实现
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── contracts/
│   │   └── src/
│   │       └── crawler/           # [新增] Zod 契约
│   └── db/
│       └── src/
│           ├── schema/
│           │   └── crawler.ts      # [新增] Drizzle 表
│           └── init.ts             # [修改] 追加建表 SQL
└── apps/
    └── api/
        └── src/
            ├── routes/v1/
            │   └── crawler.ts      # [新增] RESTful 路由
            └── modules/
                └── crawler/
                    ├── service.ts       # 爬虫生命周期
                    └── data-service.ts  # 数据查询
```

---

## 三、数据库设计（仅 SQLite，3 张表）

### crawler_tasks — 爬虫任务

| 列 | 类型 | 说明 |
|----|------|------|
| id | text PK | UUID |
| platform | text NOT NULL | xhs/dy/ks/bili/wb/zhihu/tieba |
| crawler_type | text NOT NULL | search/detail/creator |
| keywords | text | JSON 数组 |
| specified_urls | text | JSON 数组 |
| creator_ids | text | JSON 数组 |
| cookies | text | 外部传入的 Cookie |
| proxy_url | text | 可选代理地址 |
| max_notes | integer | 最大爬取数 |
| max_concurrency | integer | 并发数 |
| enable_media | integer boolean | 是否下载媒体 |
| status | text NOT NULL | queued/running/completed/failed/cancelled |
| progress | integer | 已爬取数 |
| total | integer | 预估总数 |
| error | text | 错误信息 |
| started_at | text | |
| finished_at | text | |
| created_at | text | |

### crawler_contents — 统一内容表

| 列 | 类型 | 说明 |
|----|------|------|
| id | text PK | UUID |
| platform | text NOT NULL | |
| content_id | text NOT NULL | 平台原始 ID |
| title | text | 标题 |
| desc | text | 描述 |
| display_url | text | 页面 URL |
| images | text | JSON: [{url, width, height}] |
| video_url | text | |
| video_cover_url | text | |
| author_id | text | |
| author_name | text | |
| author_avatar | text | |
| like_count | integer | |
| collect_count | integer | |
| comment_count | integer | |
| share_count | integer | |
| published_at | text | 发布时间 |
| crawled_at | text | 爬取时间 |
| task_id | text | 关联任务 |
| raw_json | text | 原始 API 响应 |
| tag | text | 搜索关键词标签 |
| UNIQUE | (content_id, platform) | |

### crawler_creators — 统一创作者表

| 列 | 类型 | 说明 |
|----|------|------|
| id | text PK | UUID |
| platform | text NOT NULL | |
| creator_id | text NOT NULL | |
| name | text | |
| avatar | text | |
| desc | text | |
| follower_count | integer | |
| following_count | integer | |
| note_count | integer | |
| gender | text | |
| crawled_at | text | |
| task_id | text | |
| raw_json | text | |
| UNIQUE | (creator_id, platform) | |

---

## 四、RESTful API 设计

### 资源与端点

所有端点前缀 `/api/v1`，使用 `offset` + `limit` 分页，错误响应遵循 `application/problem+json`（RFC 7807）。

| 方法 | 路径 | 说明 | 状态码 |
|------|------|------|--------|
| `GET` | `/crawler/platforms` | 支持的平台列表 | 200 |
| `POST` | `/crawler/tasks` | 创建并启动爬虫任务 | 201 |
| `GET` | `/crawler/tasks` | 任务列表 | 200 |
| `GET` | `/crawler/tasks/{id}` | 任务状态 | 200 |
| `POST` | `/crawler/tasks/{id}/cancel` | 取消任务 | 202 |
| `DELETE` | `/crawler/tasks/{id}` | 删除任务 | 204 |
| `GET` | `/crawler/contents` | 已爬内容列表 | 200 |
| `GET` | `/crawler/contents/{id}` | 单条内容 | 200 |
| `GET` | `/crawler/creators` | 创作者列表 | 200 |
| `GET` | `/crawler/creators/{id}` | 单个创作者 | 200 |

### 请求/响应示例

#### GET /crawler/platforms

```http
GET /api/v1/crawler/platforms

Response 200:
{
  "data": [
    { "code": "xhs",    "name": "小红书", "crawler_types": ["search","detail","creator"] },
    { "code": "dy",     "name": "抖音",   "crawler_types": ["search","detail","creator"] },
    { "code": "bili",   "name": "B站",    "crawler_types": ["search","detail","creator"] },
    { "code": "wb",     "name": "微博",   "crawler_types": ["search","detail"] },
    { "code": "zhihu",  "name": "知乎",   "crawler_types": ["search","detail"] },
    { "code": "ks",     "name": "快手",   "crawler_types": ["search","detail"] },
    { "code": "tieba",  "name": "贴吧",   "crawler_types": ["search","detail"] }
  ]
}
```

#### POST /crawler/tasks

```http
POST /api/v1/crawler/tasks
Content-Type: application/json

{
  "platform": "xhs",
  "crawler_type": "search",
  "keywords": ["美食", "旅行"],
  "cookies": "web_session=xxx;...",
  "proxy_url": "http://user:pass@host:port",
  "max_notes": 50,
  "max_concurrency": 3,
  "enable_media": false
}

Response 201:
{
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "platform": "xhs",
    "crawler_type": "search",
    "keywords": ["美食", "旅行"],
    "status": "queued",
    "created_at": "2026-06-04T10:00:00Z"
  }
}
```

请求字段：

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| platform | string | 是 | xhs/dy/ks/bili/wb/zhihu/tieba |
| crawler_type | string | 是 | search / detail / creator |
| keywords | string[] | search 必需 | 搜索关键词 |
| specified_urls | string[] | detail 必需 | 指定内容 URL |
| creator_ids | string[] | creator 必需 | 创作者 ID |
| cookies | string | 否 | Cookie 字符串 |
| proxy_url | string | 否 | 代理地址 |
| max_notes | number | 否 | 默认 100 |
| max_concurrency | number | 否 | 默认 5 |
| enable_media | boolean | 否 | 默认 false |

#### GET /crawler/tasks

```http
GET /api/v1/crawler/tasks?platform=xhs&status=completed&offset=0&limit=20&sort=-created_at

Response 200:
{
  "data": [
    {
      "id": "550e8400-...",
      "platform": "xhs",
      "crawler_type": "search",
      "keywords": ["美食"],
      "status": "completed",
      "progress": 50,
      "total": 50,
      "started_at": "2026-06-04T10:00:00Z",
      "finished_at": "2026-06-04T10:05:00Z",
      "created_at": "2026-06-04T09:59:00Z"
    }
  ],
  "pagination": { "offset": 0, "limit": 20, "total": 1, "has_more": false }
}
```

查询参数：`platform`, `status`, `crawler_type`, `keyword`, `offset`(0), `limit`(20, max 100), `sort`(-created_at)

#### POST /crawler/tasks/{id}/cancel

```http
POST /api/v1/crawler/tasks/550e8400-xxxx/cancel

Response 202:
{
  "data": { "id": "550e8400-xxxx", "status": "cancelled" }
}
```

#### GET /crawler/contents

```http
GET /api/v1/crawler/contents?platform=xhs&keyword=美食&task_id=550e8400-...&offset=0&limit=20

Response 200:
{
  "data": [
    {
      "id": "uuid",
      "platform": "xhs",
      "content_id": "123abc",
      "title": "探店笔记",
      "desc": "今天去了...",
      "display_url": "https://...",
      "images": ["https://..."],
      "author_name": "美食博主",
      "like_count": 1234,
      "published_at": "2026-06-01T08:00:00Z",
      "tag": "美食"
    }
  ],
  "pagination": { "offset": 0, "limit": 20, "total": 150, "has_more": true }
}
```

查询参数：`platform`, `keyword`(tag), `author_id`, `task_id`, `offset`, `limit`, `sort`

#### GET /crawler/creators

```http
GET /api/v1/crawler/creators?platform=xhs&offset=0&limit=20

Response 200:
{
  "data": [
    {
      "id": "uuid",
      "platform": "xhs",
      "creator_id": "creator123",
      "name": "美食博主",
      "follower_count": 50000,
      "note_count": 120
    }
  ],
  "pagination": { "offset": 0, "limit": 20, "total": 10, "has_more": false }
}
```

### 错误响应格式

```json
// 400 参数校验
{
  "type": "https://api.feedmind.local/errors/validation-error",
  "title": "请求参数校验失败",
  "status": 400,
  "detail": "platform 为必填项"
}

// 404 资源不存在
{
  "type": "https://api.feedmind.local/errors/resource-not-found",
  "title": "资源不存在",
  "status": 404,
  "detail": "任务 550e8400 不存在"
}

// 409 冲突
{
  "type": "https://api.feedmind.local/errors/conflict",
  "title": "操作冲突",
  "status": 409,
  "detail": "该平台已有任务正在运行"
}

// 500 服务器错误
{
  "type": "https://api.feedmind.local/errors/internal-error",
  "title": "服务器内部错误",
  "status": 500,
  "detail": "爬取过程中发生异常"
}
```

---

## 五、平台实现要点

### 通用模式

```typescript
class XxxCrawler implements AbstractCrawler {
  constructor(
    private cookies: string,
    private proxyUrl?: string,
    private abortSignal?: AbortSignal,
  ) {}

  async start(ctx: CrawlerContext): Promise<void> {
    // 1. 启动 Playwright（headless）
    // 2. 应用 Cookie 到 BrowserContext
    // 3. 创建 ApiClient
    // 4. 根据 crawlerType 分发
  }
}
```

### 各平台签名策略

| 平台 | 方案 | 复杂度 |
|------|------|--------|
| 小红书 | TS 移植 `xhshow` X-S/X-T 算法 | ⭐⭐⭐⭐⭐ |
| 抖音 | 直接引用 `douyin.js` 的 `a_bogus` | ⭐⭐⭐ |
| B站 | Cookie + REST API | ⭐ |
| 微博 | Cookie + REST API | ⭐ |
| 知乎 | Cookie + REST API | ⭐ |
| 快手 | Cookie + GraphQL POST | ⭐⭐ |
| 贴吧 | 无需登录 + HTML 解析(cheerio) | ⭐ |

### 任务取消

```typescript
// 使用 AbortController 控制 Playwright 生命周期
const controller = new AbortController();

// 取消时关闭浏览器上下文
controller.signal.addEventListener("abort", () => {
  await browserContext.close();
});
```

---

## 六、与 Tauri 的集成点

爬虫完全无状态，每次任务通过 API 接收：

1. **`cookies`** — Tauri 通过 CDP 连接本地 Chrome 获取 Cookie，传给 `POST /crawler/tasks`
2. **`proxy_url`** — 可选代理，直接在请求中指定

---

## 七、实施顺序

| 轮次 | 任务 | 预估 |
|------|------|------|
| **Round 1** | 创建 `crawler-core` 包骨架 + 抽象基类 + factory + types | 0.5d |
| | Contracts：enums, content, creator, task Zod schema | 0.5d |
| | DB schema：crawler_tasks + crawler_contents + crawler_creators | 0.5d |
| | DbStore 实现 | 0.5d |
| | API 路由 + service + data-service（完整链路） | 1.5d |
| | 贴吧爬虫（最简单，做端到端验证） | 1d |
| **Round 2** | 小红书爬虫（最复杂，含 X-S/X-T 签名） | 4d |
| | 抖音爬虫（含 a_bogus 签名） | 3d |
| **Round 3** | B站爬虫 | 1.5d |
| | 微博 + 知乎爬虫 | 1.5d |
| | 快手爬虫 | 1d |
| | **合计** | **~15.5 天** |

Round 1 跑通完整链路（API 创建任务 → 爬取 → 写入 DB → API 查询数据），之后逐步加入平台。
