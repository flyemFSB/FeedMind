import { randomUUID } from "node:crypto";
import { client } from "@feedmind/db";
import { HttpError } from "../../lib/http.js";
import type {
  PlatformId,
  ConnectionStatus,
  RemoteConnection,
  RemoteConnectionUpsert,
} from "@feedmind/contracts";

function toRow(r: any): RemoteConnection {
  return {
    id: r.id,
    platform: r.platform as PlatformId,
    label: r.label,
    status: r.status as ConnectionStatus,
    config: r.config ? safeParseJson(r.config) : null,
    extra: r.extra ? safeParseJson(r.extra) : null,
    error: r.error ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function safeParseJson(s: string): Record<string, unknown> | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export async function listConnections(platform?: string): Promise<RemoteConnection[]> {
  const sql = platform
    ? "SELECT * FROM remote_connections WHERE platform = ? ORDER BY created_at"
    : "SELECT * FROM remote_connections ORDER BY created_at";
  const result = platform
    ? await client.execute({ sql, args: [platform] })
    : await client.execute(sql);
  return result.rows.map(toRow);
}

export async function getConnection(id: string): Promise<RemoteConnection> {
  const result = await client.execute({
    sql: "SELECT * FROM remote_connections WHERE id = ?",
    args: [id],
  });
  if (!result.rows[0]) throw new HttpError(404, "NOT_FOUND", "连接不存在");
  return toRow(result.rows[0]);
}

export async function getConnectionByPlatform(
  platform: PlatformId,
): Promise<RemoteConnection | null> {
  const result = await client.execute({
    sql: "SELECT * FROM remote_connections WHERE platform = ?",
    args: [platform],
  });
  return result.rows[0] ? toRow(result.rows[0]) : null;
}

export async function upsertConnection(
  platform: PlatformId,
  payload: RemoteConnectionUpsert,
): Promise<RemoteConnection> {
  const existing = await client.execute({
    sql: "SELECT * FROM remote_connections WHERE platform = ?",
    args: [platform],
  });
  const now = new Date().toISOString();
  const configJson = payload.config ? JSON.stringify(payload.config) : undefined;

  if (existing.rows[0]) {
    const row = existing.rows[0] as any;
    await client.execute({
      sql: "UPDATE remote_connections SET label = ?, config = ?, updated_at = ? WHERE id = ?",
      args: [payload.label, configJson ?? row.config, now, row.id],
    });
    return getConnection(row.id);
  }

  const id = randomUUID();
  await client.execute({
    sql: "INSERT INTO remote_connections (id, platform, label, status, config, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    args: [id, platform, payload.label, "disconnected", configJson ?? null, now, now],
  });
  return getConnection(id);
}

export async function deleteConnection(id: string): Promise<void> {
  await getConnection(id);
  await client.execute({ sql: "DELETE FROM remote_connections WHERE id = ?", args: [id] });
}

export async function updateConnectionStatus(
  id: string,
  status: ConnectionStatus,
  extra?: Record<string, unknown>,
  error?: string,
): Promise<void> {
  const now = new Date().toISOString();
  const existing = await client.execute({
    sql: "SELECT extra, config FROM remote_connections WHERE id = ?",
    args: [id],
  });
  const row = existing.rows[0] as any;
  await client.execute({
    sql: "UPDATE remote_connections SET status = ?, extra = ?, error = ?, updated_at = ? WHERE id = ?",
    args: [status, extra ? JSON.stringify(extra) : (row?.extra ?? null), error ?? null, now, id],
  });
}

export async function updateConnectionConfig(
  id: string,
  config: Record<string, unknown>,
): Promise<void> {
  await client.execute({
    sql: "UPDATE remote_connections SET config = ?, updated_at = ? WHERE id = ?",
    args: [JSON.stringify(config), new Date().toISOString(), id],
  });
}
