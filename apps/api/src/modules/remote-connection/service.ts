import { randomUUID } from "node:crypto";
import { db, remoteConnections } from "@feedmind/db";
import { eq } from "drizzle-orm";
import { HttpError } from "../../lib/http.js";
import type {
  PlatformId,
  ConnectionStatus,
  RemoteConnection,
  RemoteConnectionUpsert,
} from "@feedmind/contracts";

// ─── CRUD ──────────────────────────────────────────────────────

export async function listConnections(platform?: string): Promise<RemoteConnection[]> {
  const cond = platform ? eq(remoteConnections.platform, platform) : undefined;
  const rows = cond
    ? await db.select().from(remoteConnections).where(cond)
    : await db.select().from(remoteConnections);
  return rows.map(rowToObj);
}

export async function getConnection(id: string): Promise<RemoteConnection> {
  const row = await db.select().from(remoteConnections).where(eq(remoteConnections.id, id)).get();
  if (!row) throw new HttpError(404, "NOT_FOUND", "连接不存在");
  return rowToObj(row);
}

export async function getConnectionByPlatform(
  platform: PlatformId,
): Promise<RemoteConnection | null> {
  const row = await db
    .select()
    .from(remoteConnections)
    .where(eq(remoteConnections.platform, platform))
    .get();
  return row ? rowToObj(row) : null;
}

export async function upsertConnection(
  platform: PlatformId,
  payload: RemoteConnectionUpsert,
): Promise<RemoteConnection> {
  const existing = await db
    .select()
    .from(remoteConnections)
    .where(eq(remoteConnections.platform, platform))
    .get();

  const configJson = payload.config ? JSON.stringify(payload.config) : undefined;

  if (existing) {
    await db
      .update(remoteConnections)
      .set({
        label: payload.label,
        config: configJson ?? existing.config,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(remoteConnections.id, existing.id));
    return getConnection(existing.id);
  }

  const id = randomUUID();
  await db.insert(remoteConnections).values({
    id,
    platform,
    label: payload.label,
    status: "disconnected",
    config: configJson ?? null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return getConnection(id);
}

export async function deleteConnection(id: string): Promise<void> {
  await getConnection(id); // 404 if not exists
  await db.delete(remoteConnections).where(eq(remoteConnections.id, id));
}

export async function updateConnectionStatus(
  id: string,
  status: ConnectionStatus,
  extra?: Record<string, unknown>,
  error?: string,
): Promise<void> {
  await db
    .update(remoteConnections)
    .set({
      status,
      extra: extra ? JSON.stringify(extra) : undefined,
      error: error ?? null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(remoteConnections.id, id));
}

export async function updateConnectionConfig(
  id: string,
  config: Record<string, unknown>,
): Promise<void> {
  await db
    .update(remoteConnections)
    .set({
      config: JSON.stringify(config),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(remoteConnections.id, id));
}

// ─── Helpers ───────────────────────────────────────────────────

function rowToObj(row: typeof remoteConnections.$inferSelect): RemoteConnection {
  return {
    id: row.id,
    platform: row.platform as PlatformId,
    label: row.label,
    status: row.status as ConnectionStatus,
    config: row.config ? safeParseJson(row.config) : null,
    extra: row.extra ? safeParseJson(row.extra) : null,
    error: row.error,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function safeParseJson(s: string): Record<string, unknown> | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
