import type { Client } from "@libsql/client";
import { SCHEMA_DDL } from "./schema/ddl.generated.ts";
import { copyLegacyData, hasLegacySchema, renameLegacyTables } from "./migrate.ts";

/** 应用 schema 版本号：结构变更时递增，旧库据此执行一次性迁移 */
const SCHEMA_VERSION = 1;

async function readUserVersion(client: Client): Promise<number> {
  const { rows } = await client.execute("PRAGMA user_version");
  return Number(rows[0]?.["user_version"] ?? 0);
}

/**
 * 幂等初始化数据表：旧库先迁移（重命名旧表 → 建新表 → 搬运数据 → 删旧表），新库直接建表。
 */
export async function ensureSchema(client: Client): Promise<void> {
  const version = await readUserVersion(client);
  const legacy = version < SCHEMA_VERSION && (await hasLegacySchema(client));

  if (legacy) await renameLegacyTables(client);
  await client.executeMultiple(SCHEMA_DDL);
  if (legacy) await copyLegacyData(client, process.env["DATA_DIR"]);
  if (version < SCHEMA_VERSION) await client.execute(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}
