import { eq } from "drizzle-orm";
import { db, setting, type SettingKey } from "@feedmind/db";
import type {
  ConnectionStatus,
  PlatformId,
  RemoteConnection,
  RemoteConnectionUpsert,
} from "@feedmind/contracts";
import { decryptValue, encryptValue } from "../../lib/crypto/fernet.js";
import { HttpError } from "../../lib/http.js";

/**
 * 远程平台连接：全局只允许一个（当前为飞书机器人），故存为单例配置文档，
 * 有变更即整体覆盖，不再保留多行与随机 id。
 */
interface RemoteConnectionDoc {
  platform: PlatformId;
  label: string;
  status: ConnectionStatus;
  /** 整体加密后的密文 JSON */
  config: string | null;
  /** 非敏感公开元数据 */
  extra: Record<string, unknown> | null;
  error: string | null;
}

async function readDoc(): Promise<RemoteConnectionDoc | null> {
  const [row] = await db
    .select({ value: setting.value })
    .from(setting)
    .where(eq(setting.key, "remote_connection" satisfies SettingKey))
    .limit(1);
  return (row?.value as RemoteConnectionDoc | undefined) ?? null;
}

async function writeDoc(doc: RemoteConnectionDoc): Promise<void> {
  const updatedAt = new Date().toISOString();
  const value = doc as unknown as Record<string, unknown>;
  await db
    .insert(setting)
    .values({ key: "remote_connection", value, updatedAt })
    .onConflictDoUpdate({ target: setting.key, set: { value, updatedAt } });
}

/** 解密配置密文字符串，解密失败按原明文解析回退 */
export function decryptConfigField(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    return JSON.parse(decryptValue(value)) as Record<string, unknown>;
  } catch {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

export function encryptConfigField(config: Record<string, unknown>): string {
  return encryptValue(JSON.stringify(config));
}

function toRead(doc: RemoteConnectionDoc, updatedAt: string): RemoteConnection {
  return {
    // 单例无独立标识，对外沿用 platform 作为 id，保持契约形状
    id: doc.platform,
    platform: doc.platform,
    label: doc.label,
    status: doc.status,
    config: decryptConfigField(doc.config),
    extra: doc.extra,
    error: doc.error,
    createdAt: updatedAt,
    updatedAt,
  };
}

async function readUpdatedAt(): Promise<string> {
  const [row] = await db
    .select({ updatedAt: setting.updatedAt })
    .from(setting)
    .where(eq(setting.key, "remote_connection" satisfies SettingKey))
    .limit(1);
  return row?.updatedAt ?? new Date().toISOString();
}

export async function listConnections(): Promise<RemoteConnection[]> {
  const doc = await readDoc();
  return doc ? [toRead(doc, await readUpdatedAt())] : [];
}

export async function getConnection(): Promise<RemoteConnection> {
  const doc = await readDoc();
  if (!doc)
    throw new HttpError(
      404,
      "NOT_FOUND",
      "连接不存在",
      {},
      { i18nKey: "apiError.connectionNotFound" },
    );
  return toRead(doc, await readUpdatedAt());
}

export async function getConnectionByPlatform(
  platform: PlatformId,
): Promise<RemoteConnection | null> {
  const doc = await readDoc();
  return doc && doc.platform === platform ? toRead(doc, await readUpdatedAt()) : null;
}

export async function upsertConnection(
  platform: PlatformId,
  payload: RemoteConnectionUpsert,
): Promise<RemoteConnection> {
  const current = await readDoc();
  const configJson = payload.config
    ? encryptConfigField(payload.config as Record<string, unknown>)
    : (current?.config ?? null);

  await writeDoc({
    platform,
    label: payload.label,
    status: current?.status ?? "disconnected",
    config: configJson,
    extra: current?.extra ?? null,
    error: current?.error ?? null,
  });
  return getConnection();
}

export async function deleteConnection(): Promise<void> {
  await getConnection();
  await db.delete(setting).where(eq(setting.key, "remote_connection" satisfies SettingKey));
}

export async function updateConnectionStatus(
  status: ConnectionStatus,
  error: string | null = null,
): Promise<void> {
  const doc = await readDoc();
  if (!doc) return;
  await writeDoc({ ...doc, status, error });
}

export async function updateConnectionExtra(extra: Record<string, unknown>): Promise<void> {
  const doc = await readDoc();
  if (!doc) return;
  await writeDoc({ ...doc, extra });
}
