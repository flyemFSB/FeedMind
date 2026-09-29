import { eq } from "drizzle-orm";
import type { ToolConfigUpdate, ToolRead } from "@feedmind/contracts";
import { db, toolConfig, type ToolConfigRow } from "@feedmind/db";
import { encryptValue, decryptValue } from "../../lib/crypto/fernet.js";
import { HttpError } from "../../lib/http.js";
import { TOOL_CATALOG, findToolEntry, type ToolCatalogEntry } from "./catalog.js";

/** 配置写入版本号：ToolConfigClient 据此判断是否需要重新拉库，避免等满 TTL */
let toolConfigVersion = 0;

export function getToolConfigVersion(): number {
  return toolConfigVersion;
}

/** 启动时补齐目录中缺失的配置行；已存在的一律不动（不覆盖用户配置） */
export async function ensureToolConfigs(): Promise<void> {
  for (const entry of TOOL_CATALOG) {
    await db
      .insert(toolConfig)
      .values({ name: entry.name, enabled: entry.enabledByDefault, config: {} })
      .onConflictDoNothing();
  }
}

async function loadRows(): Promise<Map<string, ToolConfigRow>> {
  const rows = await db.select().from(toolConfig);
  return new Map(rows.map((row) => [row.name, row]));
}

function toRead(
  entry: ToolCatalogEntry,
  row: ToolConfigRow | undefined,
  mode: "mask" | "plain",
): ToolRead {
  const config: Record<string, unknown> = { ...(row?.config ?? {}) };
  const passwordSet: Record<string, boolean> = {};
  for (const field of entry.configFields) {
    if (field.type !== "password") continue;
    const value = config[field.key];
    passwordSet[field.key] = typeof value === "string" && value.length > 0;
    if (mode === "mask") {
      config[field.key] = "";
    } else if (passwordSet[field.key]) {
      config[field.key] = decryptValue(value as string);
    }
  }

  return {
    name: entry.name,
    category: entry.category,
    display_name: entry.displayName,
    description: entry.description,
    config_fields: entry.configFields,
    config,
    password_set: passwordSet,
    is_enabled: row?.enabled ?? entry.enabledByDefault,
    sort_order: entry.sortOrder,
  };
}

export async function listTools(): Promise<ToolRead[]> {
  const rows = await loadRows();
  return TOOL_CATALOG.map((entry) => toRead(entry, rows.get(entry.name), "mask"));
}

export async function listToolsRuntime(): Promise<ToolRead[]> {
  const rows = await loadRows();
  return TOOL_CATALOG.map((entry) => toRead(entry, rows.get(entry.name), "plain"));
}

export async function getToolRuntime(name: string): Promise<{ config: Record<string, unknown> }> {
  const entry = findToolEntry(name);
  if (!entry)
    throw new HttpError(404, "HTTP_ERROR", "工具不存在", {}, { i18nKey: "apiError.toolNotFound" });
  const rows = await loadRows();
  return { config: toRead(entry, rows.get(name), "plain").config };
}

export async function updateToolConfig(name: string, payload: ToolConfigUpdate): Promise<ToolRead> {
  const entry = findToolEntry(name);
  if (!entry)
    throw new HttpError(404, "HTTP_ERROR", "工具不存在", {}, { i18nKey: "apiError.toolNotFound" });

  const rows = await loadRows();
  const current = rows.get(name);
  const config: Record<string, unknown> = { ...(current?.config ?? {}) };
  const passwordKeys = new Set(
    entry.configFields.filter((f) => f.type === "password").map((f) => f.key),
  );

  for (const [key, value] of Object.entries(payload.config)) {
    // 密码字段：空串表示不修改（前端始终回传空串占位），非空则加密覆盖
    if (passwordKeys.has(key)) {
      if (typeof value === "string" && value.length > 0) config[key] = encryptValue(value);
      else if (current?.config[key] === undefined) config[key] = "";
    } else {
      config[key] = value;
    }
  }

  const values = {
    config,
    ...(payload.is_enabled !== undefined ? { enabled: payload.is_enabled } : {}),
  };

  await db
    .insert(toolConfig)
    .values({ name, enabled: payload.is_enabled ?? entry.enabledByDefault, config })
    .onConflictDoUpdate({ target: toolConfig.name, set: values });
  toolConfigVersion += 1;

  const [updated] = await db.select().from(toolConfig).where(eq(toolConfig.name, name)).limit(1);
  if (!updated)
    throw new HttpError(
      500,
      "INTERNAL",
      "工具配置更新失败，请重试",
      {},
      {
        i18nKey: "apiError.toolUpdateFailed",
      },
    );
  return toRead(entry, updated, "mask");
}
