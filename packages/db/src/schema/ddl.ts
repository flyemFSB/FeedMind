import type { Client } from "@libsql/client";

/**
 * 全量数据表及索引的 DDL 语句列表（幂等：CREATE TABLE/INDEX IF NOT EXISTS）。
 * 用于全新环境自动初始化，免除对开发期 drizzle-kit push 的前置依赖。
 */
export const SCHEMA_DDL_STATEMENTS: readonly string[] = [
  // 会话表
  `CREATE TABLE IF NOT EXISTS chat_sessions (
    id text PRIMARY KEY NOT NULL,
    agent_thread_id text NOT NULL,
    title text DEFAULT '新会话' NOT NULL,
    pinned integer DEFAULT 0 NOT NULL,
    message_count integer DEFAULT 0 NOT NULL,
    last_message_at text,
    created_at text DEFAULT (current_timestamp) NOT NULL,
    updated_at text DEFAULT (current_timestamp) NOT NULL
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS chat_sessions_agent_thread_id_unique ON chat_sessions (agent_thread_id);`,
  `CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated_at ON chat_sessions (updated_at);`,
  `CREATE INDEX IF NOT EXISTS idx_chat_sessions_pinned_updated_at ON chat_sessions (pinned, updated_at);`,

  // 模型配置表
  `CREATE TABLE IF NOT EXISTS model (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    type text DEFAULT 'chat' NOT NULL,
    provider text NOT NULL,
    model_name text NOT NULL,
    model_id text DEFAULT '' NOT NULL,
    base_url text DEFAULT '' NOT NULL,
    encrypted_api_key text DEFAULT '' NOT NULL,
    context_window text,
    max_output text,
    is_selected integer DEFAULT 0 NOT NULL,
    created_at text DEFAULT (current_timestamp) NOT NULL,
    updated_at text DEFAULT (current_timestamp) NOT NULL
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_model_type_endpoint_key ON model (type, model_id, base_url, encrypted_api_key);`,

  // 运行时配置表
  `CREATE TABLE IF NOT EXISTS runtime_config (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    runtime text NOT NULL,
    llm_id integer,
    temperature real DEFAULT 0.2 NOT NULL,
    top_p real DEFAULT 1 NOT NULL,
    system_prompt text DEFAULT '' NOT NULL,
    updated_at text DEFAULT '' NOT NULL,
    FOREIGN KEY (llm_id) REFERENCES model(id) ON UPDATE no action ON DELETE set null
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS runtime_config_runtime_unique ON runtime_config (runtime);`,

  // 工具配置表
  `CREATE TABLE IF NOT EXISTS tools (
    name text PRIMARY KEY NOT NULL,
    category text NOT NULL,
    display_name text NOT NULL,
    description text,
    icon text,
    config_fields text NOT NULL,
    config text DEFAULT '{}' NOT NULL,
    is_enabled integer DEFAULT 0 NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at text DEFAULT (current_timestamp) NOT NULL,
    updated_at text DEFAULT (current_timestamp) NOT NULL
  );`,

  // 爬虫任务表
  `CREATE TABLE IF NOT EXISTS crawler_tasks (
    id text PRIMARY KEY NOT NULL,
    route text NOT NULL,
    params text NOT NULL,
    cookies text,
    proxy_url text,
    max_items integer DEFAULT 50 NOT NULL,
    status text DEFAULT 'queued' NOT NULL,
    progress integer,
    error text,
    rss_output text,
    started_at text,
    finished_at text,
    created_at text DEFAULT (current_timestamp) NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_crawler_tasks_route_status ON crawler_tasks (route, status);`,
  `CREATE INDEX IF NOT EXISTS idx_crawler_tasks_created_at ON crawler_tasks (created_at);`,
  `CREATE INDEX IF NOT EXISTS idx_crawler_tasks_status ON crawler_tasks (status);`,

  // 远程连接表（飞书等）
  `CREATE TABLE IF NOT EXISTS remote_connections (
    id text PRIMARY KEY NOT NULL,
    platform text NOT NULL,
    label text NOT NULL,
    status text DEFAULT 'disconnected' NOT NULL,
    config text,
    extra text,
    error text,
    created_at text DEFAULT (current_timestamp) NOT NULL,
    updated_at text DEFAULT (current_timestamp) NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_remote_conn_platform ON remote_connections (platform);`,
  `CREATE INDEX IF NOT EXISTS idx_remote_conn_status ON remote_connections (status);`,

  // Cookie 凭据存储表
  `CREATE TABLE IF NOT EXISTS cookie_store (
    uuid text NOT NULL,
    platform text NOT NULL,
    cookies text NOT NULL,
    valid integer,
    checked_at text,
    PRIMARY KEY(uuid, platform)
  );`,

  // CookieCloud 配置表
  `CREATE TABLE IF NOT EXISTS cookie_cloud (
    uuid text PRIMARY KEY NOT NULL,
    password text NOT NULL,
    encrypted text NOT NULL,
    crypto_type text DEFAULT 'legacy' NOT NULL
  );`,

  // RSS 源配置表
  `CREATE TABLE IF NOT EXISTS rss_sources (
    id text PRIMARY KEY NOT NULL,
    type text NOT NULL,
    platform text,
    route text,
    url text NOT NULL,
    title text NOT NULL,
    params text,
    last_synced_at text,
    created_at text DEFAULT (current_timestamp) NOT NULL,
    updated_at text DEFAULT (current_timestamp) NOT NULL
  );`,

  // Feed 条目表
  `CREATE TABLE IF NOT EXISTS feeds (
    id text PRIMARY KEY NOT NULL,
    source_id text NOT NULL,
    title text NOT NULL,
    description text,
    link text,
    guid text NOT NULL,
    author text,
    category text,
    image text,
    pub_date text,
    fetched_at text NOT NULL,
    is_read integer DEFAULT 0 NOT NULL,
    created_at text DEFAULT (current_timestamp) NOT NULL
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_feeds_source_guid ON feeds (source_id, guid);`,

  // 定时任务调度表
  `CREATE TABLE IF NOT EXISTS schedule_tasks (
    id text PRIMARY KEY NOT NULL,
    name text NOT NULL,
    cron text NOT NULL,
    timezone text DEFAULT 'Asia/Shanghai' NOT NULL,
    enabled integer DEFAULT 1 NOT NULL,
    last_run_at text,
    last_run_status text,
    last_error text,
    created_at text NOT NULL,
    updated_at text NOT NULL
  );`,

  // 日报视频产物表
  `CREATE TABLE IF NOT EXISTS videos (
    id text PRIMARY KEY NOT NULL,
    schedule_id text NOT NULL,
    report_date text NOT NULL,
    status text NOT NULL,
    stage text,
    file_path text,
    duration integer,
    error text,
    created_at text NOT NULL,
    updated_at text NOT NULL
  );`,
];

/**
 * 确保所有数据表及索引存在（自动执行 DDL 迁移）。
 */
export async function ensureSchema(client: Client): Promise<void> {
  for (const statement of SCHEMA_DDL_STATEMENTS) {
    await client.execute(statement);
  }
}
