import { client } from "./client.js";

const SCHEMA_SQL = [
  `create table if not exists chat_sessions (
    id text primary key not null,
    agent_thread_id text not null unique,
    title text not null default '新会话',
    pinned integer not null default false,
    message_count integer not null default 0,
    last_message_at text,
    created_at text not null default (current_timestamp),
    updated_at text not null default (current_timestamp)
  )`,
  `create index if not exists idx_chat_sessions_updated_at on chat_sessions (updated_at)`,
  `create index if not exists idx_chat_sessions_pinned_updated_at on chat_sessions (pinned, updated_at)`,
  `create table if not exists chat_messages (
    id text primary key not null,
    session_id text not null references chat_sessions(id) on delete cascade,
    agent_message_id text not null,
    role text not null check(role in ('user', 'assistant', 'system', 'tool')),
    content text not null,
    status text not null default 'completed' check(status in ('streaming', 'completed', 'failed')),
    model text not null default '',
    metadata text not null default '{}',
    created_at text not null default (current_timestamp),
    updated_at text not null default (current_timestamp),
    unique(session_id, agent_message_id)
  )`,
  `create index if not exists idx_chat_messages_session_created_at on chat_messages (session_id, created_at)`,
  `create table if not exists llm (
    id integer primary key autoincrement not null,
    provider text not null,
    model_name text not null unique,
    base_url text not null default '',
    encrypted_api_key text not null default '',
    is_selected integer not null default false,
    created_at text not null default (current_timestamp),
    updated_at text not null default (current_timestamp)
  )`,
  `create table if not exists tools (
    name text primary key not null,
    category text not null,
    display_name text not null,
    description text,
    icon text,
    config_fields text not null default '[]',
    config text not null default '{}',
    is_enabled integer not null default false,
    sort_order integer not null default 0,
    created_at text not null default (current_timestamp),
    updated_at text not null default (current_timestamp)
  )`,
  // ─── Crawler tables ─────────────────────────────────
  `create table if not exists crawler_tasks (
    id text primary key not null,
    platform text not null,
    crawler_type text not null,
    keywords text,
    specified_urls text,
    creator_ids text,
    cookies text,
    proxy_url text,
    max_notes integer not null default 100,
    max_concurrency integer not null default 5,
    enable_media integer not null default 0,
    status text not null default 'queued',
    progress integer default 0,
    total integer default 0,
    error text,
    started_at text,
    finished_at text,
    created_at text not null default (current_timestamp)
  )`,
  `create index if not exists idx_crawler_tasks_platform_status on crawler_tasks (platform, status)`,
  `create index if not exists idx_crawler_tasks_created_at on crawler_tasks (created_at)`,
  `create index if not exists idx_crawler_tasks_status on crawler_tasks (status)`,
  `create table if not exists crawler_contents (
    id text primary key not null,
    platform text not null,
    content_id text not null,
    title text,
    desc text,
    display_url text,
    images text,
    video_url text,
    video_cover_url text,
    author_id text,
    author_name text,
    author_avatar text,
    like_count integer,
    collect_count integer,
    comment_count integer,
    share_count integer,
    published_at text,
    crawled_at text not null default (current_timestamp),
    task_id text,
    raw_json text,
    tag text,
    unique(content_id, platform)
  )`,
  `create index if not exists idx_crawler_contents_platform on crawler_contents (platform)`,
  `create index if not exists idx_crawler_contents_task_id on crawler_contents (task_id)`,
  `create index if not exists idx_crawler_contents_author_id on crawler_contents (author_id)`,
  `create index if not exists idx_crawler_contents_tag on crawler_contents (tag)`,
  `create table if not exists crawler_creators (
    id text primary key not null,
    platform text not null,
    creator_id text not null,
    name text,
    avatar text,
    desc text,
    follower_count integer,
    following_count integer,
    note_count integer,
    gender text,
    crawled_at text not null default (current_timestamp),
    task_id text,
    raw_json text,
    unique(creator_id, platform)
  )`,
  `create index if not exists idx_crawler_creators_platform on crawler_creators (platform)`,
  `create index if not exists idx_crawler_creators_task_id on crawler_creators (task_id)`,
];

const SEED_TOOLS = [
  {
    name: "web_search",
    category: "search",
    display_name: "搜索引擎",
    description: "搜索互联网获取最新信息。未配置 API Key 时自动使用 AnySearch 匿名模式兜底。",
    config_fields: JSON.stringify([
      { key: "tavilyApiKey", type: "password", label: "Tavily API Key", description: "从 Tavily 获取", link: "https://tavily.com" },
      { key: "exaApiKey", type: "password", label: "Exa API Key", description: "从 Exa 获取", link: "https://exa.ai" },
      { key: "anysearchApiKey", type: "password", label: "AnySearch API Key", description: "从 AnySearch 获取（留空则自动使用匿名模式）", link: "https://www.anysearch.com/console/api-keys" },
    ]),
    is_enabled: true,
    sort_order: 0,
  },
  {
    name: "web_fetch",
    category: "utility",
    display_name: "网页抓取",
    description: "抓取网页内容并提取正文。",
    config_fields: JSON.stringify([
      { key: "jinaApiKey", type: "password", label: "Jina AI API Key", description: "从 Jina AI 获取（留空则自动使用匿名模式，20 RPM）", link: "https://jina.ai/reader" },
    ]),
    is_enabled: true,
    sort_order: 1,
  },
];

export async function initDatabase(): Promise<void> {
  for (const sql of SCHEMA_SQL) {
    await client.execute(sql);
  }

  for (const tool of SEED_TOOLS) {
    // 首次写入：insert or ignore 按 name 主键去重
    await client.execute({
      sql: `insert or ignore into tools (name, category, display_name, description, config_fields, is_enabled, sort_order) values (?, ?, ?, ?, ?, ?, ?)`,
      args: [tool.name, tool.category, tool.display_name, tool.description, tool.config_fields, tool.is_enabled, tool.sort_order],
    });

    // 已有行更新：仅刷新 config_fields 和 description，不触碰 config（用户已设的 API Key）
    await client.execute({
      sql: `update tools set config_fields = ?, description = ? where name = ?`,
      args: [tool.config_fields, tool.description, tool.name],
    });
  }

  console.log("[db] Tables ready, tools seeded.");
}
