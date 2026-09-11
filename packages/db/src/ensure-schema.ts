import type { Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { pushSQLiteSchema } from "drizzle-kit/api";
import * as schema from "./schema/index.ts";

/**
 * 幂等建表：从 Drizzle schema 推导 SQL（与 schema.test 同一路径），
 * 消除手写 DDL 双真源。开发期改结构直接 db:reset / 删库。
 */
export async function ensureSchema(client: Client): Promise<void> {
  const db = drizzle(client, { schema });
  const push = await pushSQLiteSchema(schema, db);
  await push.apply();
}

/** Wiki FTS 派生索引（可随时重建，不参与业务表生命周期） */
export async function ensureWikiFtsTables(client: Client): Promise<void> {
  await client.execute(`CREATE VIRTUAL TABLE IF NOT EXISTS wiki_fts USING fts5(
    space_id UNINDEXED, path UNINDEXED, title, content, tokenize='trigram')`);
  await client.execute(`CREATE TABLE IF NOT EXISTS wiki_fts_meta (
    space_id TEXT PRIMARY KEY, fingerprint TEXT, updated_at INTEGER)`);
}
