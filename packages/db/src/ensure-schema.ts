import type { Client } from "@libsql/client";
import { SCHEMA_DDL } from "./schema/ddl.generated.ts";

/** 执行预生成的 SQLite DDL 幂等初始化全部数据表 */
export async function ensureSchema(client: Client): Promise<void> {
  await client.executeMultiple(SCHEMA_DDL);
}

/** 初始化 Wiki 全文检索虚表与元数据表 */
export async function ensureWikiFtsTables(client: Client): Promise<void> {
  // 校验 FTS 结构完整性，结构不匹配时重建索引表
  try {
    const meta = await client.execute(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'wiki_fts'",
    );
    const sql = meta.rows[0]?.["sql"] as string | undefined;
    if (sql && (sql.toLowerCase().includes("trigram") || !sql.includes("raw_title"))) {
      await client.execute("DROP TABLE IF EXISTS wiki_fts");
      await client.execute("DELETE FROM wiki_fts_meta");
    }
  } catch {
    // 首次初始化表不存在时忽略查询异常
  }

  await client.execute(`CREATE VIRTUAL TABLE IF NOT EXISTS wiki_fts USING fts5(
    space_id UNINDEXED, path UNINDEXED, raw_title UNINDEXED, title, content, tokenize='unicode61')`);
  await client.execute(`CREATE TABLE IF NOT EXISTS wiki_fts_meta (
    space_id TEXT PRIMARY KEY, fingerprint TEXT, updated_at INTEGER)`);
}
