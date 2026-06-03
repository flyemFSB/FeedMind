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
  // ---- Wiki tables ----
  `create table if not exists wiki_spaces (
    id text primary key not null,
    name text not null default 'My Wiki',
    template text not null default 'general',
    purpose text not null default '',
    schema text not null default '',
    settings text not null default '{}',
    created_at text not null default (current_timestamp),
    updated_at text not null default (current_timestamp)
  )`,
  `create index if not exists idx_wiki_spaces_updated_at on wiki_spaces (updated_at)`,
  `create table if not exists wiki_pages (
    id text primary key not null,
    space_id text not null references wiki_spaces(id) on delete cascade,
    path text not null,
    slug text not null,
    type text not null default 'concept',
    title text not null,
    content text not null default '',
    frontmatter text not null default '{}',
    sources text not null default '[]',
    tags text not null default '[]',
    related text not null default '[]',
    created_at text not null default (current_timestamp),
    updated_at text not null default (current_timestamp),
    unique(space_id, path)
  )`,
  `create index if not exists idx_wiki_pages_space_slug on wiki_pages (space_id, slug)`,
  `create index if not exists idx_wiki_pages_space_type on wiki_pages (space_id, type)`,
  `create index if not exists idx_wiki_pages_space_updated_at on wiki_pages (space_id, updated_at)`,
  `create index if not exists idx_wiki_pages_space_path on wiki_pages (space_id, path)`,
  `create table if not exists wiki_page_revisions (
    id text primary key not null,
    page_id text not null references wiki_pages(id) on delete cascade,
    job_id text,
    before_content text,
    after_content text not null,
    reason text not null default 'manual_edit',
    created_at text not null default (current_timestamp)
  )`,
  `create index if not exists idx_wiki_page_revisions_page_id on wiki_page_revisions (page_id)`,
  `create table if not exists wiki_sources (
    id text primary key not null,
    space_id text not null references wiki_spaces(id) on delete cascade,
    identity text not null,
    title text not null,
    kind text not null default 'text',
    original_name text,
    original_uri text,
    storage_path text,
    normalized_text text not null default '',
    content_hash text,
    mime_type text,
    size_bytes integer,
    status text not null default 'new',
    metadata text not null default '{}',
    created_at text not null default (current_timestamp),
    updated_at text not null default (current_timestamp),
    unique(space_id, identity)
  )`,
  `create index if not exists idx_wiki_sources_space_content_hash on wiki_sources (space_id, content_hash)`,
  `create index if not exists idx_wiki_sources_space_status on wiki_sources (space_id, status)`,
  `create table if not exists wiki_source_pages (
    source_id text not null references wiki_sources(id) on delete cascade,
    page_id text not null references wiki_pages(id) on delete cascade,
    job_id text,
    relation text not null default 'cited',
    created_at text not null default (current_timestamp),
    unique(source_id, page_id)
  )`,
  `create index if not exists idx_wiki_source_pages_source_id on wiki_source_pages (source_id)`,
  `create index if not exists idx_wiki_source_pages_page_id on wiki_source_pages (page_id)`,
  `create table if not exists wiki_links (
    id text primary key not null,
    space_id text not null references wiki_spaces(id) on delete cascade,
    from_page_id text not null references wiki_pages(id) on delete cascade,
    to_page_id text,
    raw_target text not null,
    alias text,
    status text not null default 'missing'
  )`,
  `create index if not exists idx_wiki_links_from_page on wiki_links (from_page_id)`,
  `create index if not exists idx_wiki_links_to_page on wiki_links (to_page_id)`,
  `create index if not exists idx_wiki_links_space on wiki_links (space_id)`,
  `create table if not exists wiki_ingest_jobs (
    id text primary key not null,
    space_id text not null references wiki_spaces(id) on delete cascade,
    source_id text,
    type text not null default 'ingest',
    status text not null default 'queued',
    stage text,
    progress_current integer default 0,
    progress_total integer default 0,
    attempt integer not null default 0,
    max_attempts integer not null default 3,
    input text not null default '{}',
    output text default '{}',
    error text,
    started_at text,
    finished_at text,
    created_at text not null default (current_timestamp),
    updated_at text not null default (current_timestamp)
  )`,
  `create index if not exists idx_wiki_jobs_space_status on wiki_ingest_jobs (space_id, status)`,
  `create index if not exists idx_wiki_jobs_space_created on wiki_ingest_jobs (space_id, created_at)`,
  `create table if not exists wiki_review_items (
    id text primary key not null,
    space_id text not null references wiki_spaces(id) on delete cascade,
    source_id text,
    page_id text,
    job_id text,
    type text not null,
    severity text not null default 'info',
    status text not null default 'open',
    title text not null,
    description text not null default '',
    affected_pages text not null default '[]',
    search_queries text not null default '[]',
    options text not null default '[]',
    resolved_action text,
    created_at text not null default (current_timestamp),
    resolved_at text
  )`,
  `create index if not exists idx_wiki_review_space_status on wiki_review_items (space_id, status)`,
  `create index if not exists idx_wiki_review_space_created on wiki_review_items (space_id, created_at)`,
  `create table if not exists wiki_lint_runs (
    id text primary key not null,
    space_id text not null references wiki_spaces(id) on delete cascade,
    type text not null,
    status text not null default 'running',
    result text default '{}',
    created_at text not null default (current_timestamp),
    finished_at text
  )`,
  `create index if not exists idx_wiki_lint_runs_space_type on wiki_lint_runs (space_id, type)`,
  `create table if not exists wiki_lint_items (
    id text primary key not null,
    run_id text not null references wiki_lint_runs(id) on delete cascade,
    space_id text not null references wiki_spaces(id) on delete cascade,
    type text not null,
    severity text not null default 'warning',
    page_id text,
    message text not null,
    details text default '{}',
    created_at text not null default (current_timestamp)
  )`,
  `create index if not exists idx_wiki_lint_items_run_id on wiki_lint_items (run_id)`,
  `create index if not exists idx_wiki_lint_items_space_type on wiki_lint_items (space_id, type)`,
  `create table if not exists wiki_graph_insight_dismissals (
    id text primary key not null,
    space_id text not null references wiki_spaces(id) on delete cascade,
    insight_key text not null,
    created_at text not null default (current_timestamp),
    unique(space_id, insight_key)
  )`,
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
    client.execute(sql);
  }

  for (const tool of SEED_TOOLS) {
    // 首次写入：insert or ignore 按 name 主键去重
    client.execute({
      sql: `insert or ignore into tools (name, category, display_name, description, config_fields, is_enabled, sort_order) values (?, ?, ?, ?, ?, ?, ?)`,
      args: [tool.name, tool.category, tool.display_name, tool.description, tool.config_fields, tool.is_enabled, tool.sort_order],
    });

    // 已有行更新：仅刷新 config_fields 和 description，不触碰 config（用户已设的 API Key）
    client.execute({
      sql: `update tools set config_fields = ?, description = ? where name = ?`,
      args: [tool.config_fields, tool.description, tool.name],
    });
  }

  // 确保 Wiki 默认空间存在
  const existingSpaces = await client.execute("select count(*) as cnt from wiki_spaces");
  const rowCount = Number(existingSpaces.rows[0]?.cnt ?? 0);
  if (rowCount === 0) {
    const spaceId = crypto.randomUUID();
    const purpose = `# Purpose\n\n这是一个通用 Wiki 工作区，用于整理和结构化你的知识。\n\n## 目标\n\n- 从原始资料中提取核心知识。\n- 维护实体和概念的交叉引用。\n- 通过检索和图谱高效利用知识。`;
    const schema = `# Schema\n\n## Page Types\n\n- **entity**: 真实世界的具体对象（人、组织、产品、论文）\n- **concept**: 抽象概念和术语\n- **source**: 原始资料的摘要页面\n- **query**: 会话问题和回答\n- **comparison**: 对比分析\n- **synthesis**: 综合多个来源的分析\n- **overview**: 概览页面`;
    client.execute({
      sql: `insert into wiki_spaces (id, name, template, purpose, schema) values (?, ?, ?, ?, ?)`,
      args: [spaceId, 'My Wiki', 'general', purpose, schema],
    });
    console.log("[db] Default wiki space created.");
  }

  console.log("[db] Tables ready, tools seeded.");
}
