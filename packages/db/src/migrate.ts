import type { Client } from "@libsql/client";
import { resolve } from "node:path";
import { dbLogger } from "./logger.ts";

/** 旧表统一改名加前缀，让新表能用原表名建出来 */
const LEGACY_TABLES = [
  "chat_sessions",
  "cookie_cloud",
  "cookie_store",
  "crawler_tasks",
  "feeds",
  "model",
  "operation_log",
  "remote_connections",
  "rss_sources",
  "runtime_config",
  "schedule_tasks",
  "tools",
  "videos",
] as const;

/** 旧库判定：存在任一旧表即视为待迁移 */
export async function hasLegacySchema(client: Client): Promise<boolean> {
  const { rows } = await client.execute({
    sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    args: ["rss_sources"],
  });
  return rows.length > 0;
}

async function tableExists(client: Client, name: string): Promise<boolean> {
  const { rows } = await client.execute({
    sql: "SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name = ?",
    args: [name],
  });
  return rows.length > 0;
}

/** 重命名旧表（保留原名可用），并丢弃结构已变的派生索引表 */
export async function renameLegacyTables(client: Client): Promise<void> {
  for (const name of LEGACY_TABLES) {
    if (await tableExists(client, name)) {
      await client.execute(`ALTER TABLE "${name}" RENAME TO "_legacy_${name}"`);
    }
  }
  // FTS 虚表列结构已变（content → body），直接丢弃后按新 DDL 重建
  await client.execute("DROP TABLE IF EXISTS wiki_fts");
  await client.execute("DROP TABLE IF EXISTS wiki_fts_meta");
}

/** 旧数据搬运语句：列名/枚举/形态按新 schema 收敛 */
const COPY_SQL: string[] = [
  // 订阅源：last_synced_at 与 updated_at 语义收敛取较新者；social 源补平台
  `INSERT INTO source (id, kind, title, url, platform, route, params, created_at, updated_at)
   SELECT id, type, title, url,
     COALESCE(platform, CASE
       WHEN route LIKE 'bili/%' THEN 'bilibili'
       WHEN route LIKE 'dy/%' THEN 'douyin'
       WHEN route LIKE 'xhs/%' THEN 'xiaohongshu'
       WHEN route LIKE 'zh/%' THEN 'zhihu'
       WHEN route LIKE 'weread/%' THEN 'weread'
     END),
     route, params, created_at, COALESCE(last_synced_at, updated_at)
   FROM _legacy_rss_sources
   WHERE type = 'rss' OR platform IS NOT NULL
      OR route LIKE 'bili/%' OR route LIKE 'dy/%' OR route LIKE 'xhs/%'
      OR route LIKE 'zh/%' OR route LIKE 'weread/%'`,

  // 订阅条目：category → tags，fetched_at → created_at，is_read → read_at
  `INSERT INTO feed_item (id, source_id, guid, title, summary, url, author, tags, image,
                          published_at, read_at, created_at, updated_at)
   SELECT id, source_id, guid, title, description, link, author, category, image, pub_date,
     CASE WHEN is_read = 1 THEN COALESCE(fetched_at, created_at) END,
     COALESCE(fetched_at, created_at), COALESCE(fetched_at, created_at)
   FROM _legacy_feeds`,

  // 日报运行：丢弃 schedule_id，file_path → video_path；终态时间用 updated_at 兑底
  `INSERT INTO report_run (id, report_date, status, stage, video_path, duration_sec, error,
                           finished_at, created_at, updated_at)
   SELECT id, report_date, status, stage, file_path, duration, error,
     CASE WHEN status IN ('success', 'failed') THEN updated_at END,
     created_at, updated_at
   FROM _legacy_videos`,

  // 模型：is_selected=1 → usage=<kind>（部分唯一索引保证每个用途只有一个）
  `INSERT INTO model (id, kind, provider, name, api_model, base_url, api_key,
                      context_window, max_output, usage, created_at, updated_at)
   SELECT id, type, provider, model_name, model_id, base_url, encrypted_api_key,
          context_window, max_output,
          CASE WHEN is_selected = 1 AND type IN ('chat', 'ocr', 'embedding') THEN type END,
          created_at, updated_at
   FROM _legacy_model`,

  // 知识导入模型绑定：runtime_config('wiki').llm_id → model.usage='wiki'
  `UPDATE model SET usage = 'wiki'
   WHERE usage IS NULL AND id = (
     SELECT llm_id FROM _legacy_runtime_config WHERE runtime = 'wiki' AND llm_id IS NOT NULL
   )`,

  // 单例配置：CookieCloud 账号（优先取有口令的那份）
  `INSERT INTO setting (key, value)
   SELECT 'cookie_cloud', json_object('uuid', uuid, 'password', password,
                                      'payload', encrypted, 'crypto_type', crypto_type)
   FROM _legacy_cookie_cloud
   ORDER BY (password = '') ASC, rowid ASC LIMIT 1`,

  // 单例配置：平台 Cookie（每平台取最新一行，来源维度取消）
  `INSERT INTO setting (key, value)
   SELECT 'platform_cookie', json_group_object(platform,
     json_object('cookies', cookies, 'valid',
       CASE valid WHEN 1 THEN json('true') WHEN 0 THEN json('false') ELSE NULL END,
       'updated_at', updated_at))
   FROM (
     SELECT platform, cookies, valid, updated_at,
            ROW_NUMBER() OVER (PARTITION BY platform ORDER BY updated_at DESC) AS rn
     FROM _legacy_cookie_store
   ) WHERE rn = 1`,

  // 单例配置：日报调度（全局只保留一份）
  `INSERT INTO setting (key, value)
   SELECT 'report_schedule', json_object('name', name, 'cron', cron, 'timezone', timezone,
     'enabled', json(CASE WHEN enabled = 1 THEN 'true' ELSE 'false' END))
   FROM _legacy_schedule_tasks ORDER BY created_at LIMIT 1`,

  // 单例配置：远程连接（每平台一行，取一份）
  `INSERT INTO setting (key, value)
   SELECT 'remote_connection', json_object('platform', platform, 'label', label, 'status', status,
     'config', config, 'extra', json(extra), 'error', error)
   FROM _legacy_remote_connections ORDER BY created_at LIMIT 1`,

  // 工具配置：展示元数据移回代码目录，只保留开关与配置
  `INSERT INTO tool_config (name, enabled, config)
   SELECT name, is_enabled, config FROM _legacy_tools`,

  // 审计日志：ts → created_at，target → category（旧值收敛到新分类）
  `INSERT INTO operation_log (id, created_at, category, action, target_id, target_name, detail, result)
   SELECT id, ts,
     CASE target
       WHEN 'rss_source' THEN 'source' WHEN 'feeds' THEN 'feed' WHEN 'chat_session' THEN 'chat'
       WHEN 'cookie_store' THEN 'cookie' WHEN 'daily_report' THEN 'report'
       WHEN 'wiki_space' THEN 'wiki' WHEN 'wiki_page' THEN 'wiki' WHEN 'wiki_source' THEN 'wiki'
       WHEN 'runtime_config' THEN 'model'
       ELSE target
     END,
     action, NULL, target_name, detail, result
   FROM _legacy_operation_log`,
];

const DROP_SQL: string[] = LEGACY_TABLES.map((name) => `DROP TABLE IF EXISTS "_legacy_${name}"`);

/**
 * 搬运旧数据并清理旧表。
 * 全程关闭外键：SQLite 官方建议在结构变更期间关闭，避免重命名/删表触发的隐式约束检查。
 */
export async function copyLegacyData(client: Client, dataDir: string | undefined): Promise<void> {
  const mastraPath = dataDir ? resolve(dataDir, "mastra.db") : null;
  const hasChatTitles = await tableExists(client, "_legacy_chat_sessions");
  const canBackfillTitles = hasChatTitles && Boolean(mastraPath);

  await client.execute("PRAGMA foreign_keys = OFF");
  try {
    // 1) 单库搬运放进一个事务：任一条失败即整体回滚
    const tx = await client.transaction("write");
    try {
      await tx.executeMultiple(COPY_SQL.join(";\n"));
      await tx.commit();
    } catch (err) {
      await tx.rollback().catch(() => {});
      throw err;
    }

    // 2) 会话标题回填 mastra 库：ATTACH 是连接级状态，必须与 UPDATE 同连接，故不用事务
    if (canBackfillTitles && mastraPath) {
      await backfillChatTitles(client, mastraPath);
    } else if (hasChatTitles) {
      // 无 mastra 库可回填时保留旧表，避免静默丢弃标题
      dbLogger.warn("未设置 DATA_DIR，会话标题未回填，保留 _legacy_chat_sessions 供手工处理");
    }

    // 3) 清理旧表（标题未回填时保留会话表）
    for (const sql of DROP_SQL) {
      if (sql.includes("_legacy_chat_sessions") && !canBackfillTitles) continue;
      await client.execute(sql);
    }
  } finally {
    await client.execute("PRAGMA foreign_keys = ON");
  }
}

/** 会话标题/置顶迁到 mastra 线程，并把 resourceId 统一为本地用户（跨库写入，仅迁移期使用） */
async function backfillChatTitles(client: Client, mastraPath: string): Promise<void> {
  await client.execute({
    sql: "ATTACH DATABASE ? AS mastra",
    args: [mastraPath.replace(/\\/g, "/")],
  });
  try {
    await client.execute(`UPDATE mastra.mastra_threads SET
      title = CASE WHEN COALESCE(title, '') = '' THEN
        (SELECT s.title FROM _legacy_chat_sessions s WHERE s.agent_thread_id = mastra.mastra_threads.id)
        ELSE title END,
      metadata = CASE WHEN (SELECT s.pinned FROM _legacy_chat_sessions s
                            WHERE s.agent_thread_id = mastra.mastra_threads.id) = 1
        THEN json_set(COALESCE(NULLIF(metadata, ''), '{}'), '$.pinned', json('true'))
        ELSE metadata END
      WHERE EXISTS (SELECT 1 FROM _legacy_chat_sessions s
                    WHERE s.agent_thread_id = mastra.mastra_threads.id)`);
    // 旧实现把 resourceId 当成 threadId，导致语义召回被锁在单会话内；统一为本地用户资源
    await client.execute(
      "UPDATE mastra.mastra_threads SET resourceId = 'local-user' WHERE resourceId = id",
    );
    await client.execute(
      "UPDATE mastra.mastra_messages SET resourceId = 'local-user' WHERE resourceId = thread_id",
    );
    await client.execute(
      "UPDATE mastra.mastra_observational_memory SET resourceId = 'local-user' WHERE resourceId = threadId",
    );
  } finally {
    await client.execute("DETACH DATABASE mastra").catch(() => {});
  }
}
