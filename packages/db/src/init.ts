import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { client, closeDb, initDbPragmas } from "./client.ts";
import { ensureSchema } from "./ensure-schema.ts";
import { dbLogger } from "./logger.ts";

/** 审计日志保留期（天），启动时清理过期记录 */
const AUDIT_RETENTION_DAYS = 180;

async function pruneAuditLog(): Promise<void> {
  await client.execute({
    sql: `DELETE FROM operation_log WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ','now',?)`,
    args: [`-${AUDIT_RETENTION_DAYS} days`],
  });
}

export async function initDatabase(): Promise<void> {
  await initDbPragmas();
  await ensureSchema(client);
  await pruneAuditLog();
  dbLogger.info("数据库初始化完成");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await initDatabase();
  closeDb();
}
