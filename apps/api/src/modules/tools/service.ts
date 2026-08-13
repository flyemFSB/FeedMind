import { eq } from "drizzle-orm";
import type { ToolConfigUpdate, ToolRead, ConfigField } from "@feedmind/contracts";
import { db, tools } from "@feedmind/db";
import type { ToolRow } from "@feedmind/db";
import { encryptValue, decryptValue } from "@feedmind/shared";
import { HttpError } from "../../lib/http.js";

function maskSensitiveFields(row: ToolRow): ToolRead {
  const fields = JSON.parse(row.configFields) as ConfigField[];
  const config: Record<string, unknown> = JSON.parse(row.config);
  const passwordSet: Record<string, boolean> = {};
  for (const f of fields) {
    if (f.type === "password") {
      passwordSet[f.key] = !!config[f.key];
      config[f.key] = "";
    }
  }
  return {
    name: row.name,
    category: row.category,
    display_name: row.displayName,
    description: row.description ?? null,
    icon: row.icon ?? null,
    config_fields: fields,
    config,
    password_set: passwordSet,
    is_enabled: row.isEnabled,
    sort_order: row.sortOrder,
  };
}

function decryptRow(row: ToolRow): ToolRead {
  const fields = JSON.parse(row.configFields) as ConfigField[];
  const config: Record<string, unknown> = JSON.parse(row.config);
  const passwordSet: Record<string, boolean> = {};
  for (const f of fields) {
    if (f.type === "password" && typeof config[f.key] === "string" && config[f.key]) {
      config[f.key] = decryptValue(config[f.key] as string);
      passwordSet[f.key] = true;
    }
  }
  return {
    name: row.name,
    category: row.category,
    display_name: row.displayName,
    description: row.description ?? null,
    icon: row.icon ?? null,
    config_fields: fields,
    config,
    password_set: passwordSet,
    is_enabled: row.isEnabled,
    sort_order: row.sortOrder,
  };
}

export async function listTools(): Promise<ToolRead[]> {
  const rows = await db.select().from(tools).orderBy(tools.sortOrder);
  return rows.map(maskSensitiveFields);
}

export async function listToolsRuntime(): Promise<ToolRead[]> {
  const rows = await db.select().from(tools).orderBy(tools.sortOrder);
  return rows.map(decryptRow);
}

export async function getTool(name: string): Promise<ToolRead> {
  const [row] = await db.select().from(tools).where(eq(tools.name, name)).limit(1);
  if (!row)
    throw new HttpError(404, "HTTP_ERROR", "工具不存在", {}, { i18nKey: "apiError.toolNotFound" });
  return maskSensitiveFields(row);
}

export async function getToolRuntime(name: string): Promise<{ config: Record<string, unknown> }> {
  const [row] = await db.select().from(tools).where(eq(tools.name, name)).limit(1);
  if (!row)
    throw new HttpError(404, "HTTP_ERROR", "工具不存在", {}, { i18nKey: "apiError.toolNotFound" });
  const fields = JSON.parse(row.configFields) as ConfigField[];
  const config: Record<string, unknown> = JSON.parse(row.config);
  for (const f of fields) {
    if (f.type === "password" && typeof config[f.key] === "string" && config[f.key]) {
      config[f.key] = decryptValue(config[f.key] as string);
    }
  }
  return { config };
}

export async function updateToolConfig(name: string, payload: ToolConfigUpdate): Promise<ToolRead> {
  const [row] = await db.select().from(tools).where(eq(tools.name, name)).limit(1);
  if (!row)
    throw new HttpError(404, "HTTP_ERROR", "工具不存在", {}, { i18nKey: "apiError.toolNotFound" });

  const fields = JSON.parse(row.configFields) as ConfigField[];
  const currentConfig = JSON.parse(row.config) as Record<string, unknown>;

  const passwordKeys = new Set(fields.filter((f) => f.type === "password").map((f) => f.key));
  for (const [key, value] of Object.entries(payload.config)) {
    if (passwordKeys.has(key)) {
      currentConfig[key] = typeof value === "string" && value.length > 0 ? encryptValue(value) : "";
    } else {
      currentConfig[key] = value;
    }
  }

  const updateValues: Partial<typeof tools.$inferInsert> = {
    config: JSON.stringify(currentConfig),
    updatedAt: new Date().toISOString(),
  };
  if (payload.is_enabled !== undefined) {
    updateValues.isEnabled = payload.is_enabled;
  }

  await db.update(tools).set(updateValues).where(eq(tools.name, name));

  const [updated] = await db.select().from(tools).where(eq(tools.name, name)).limit(1);
  if (!updated)
    throw new HttpError(
      500,
      "INTERNAL",
      "工具配置更新失败，请重试",
      {},
      { i18nKey: "apiError.toolUpdateFailed" },
    );
  return maskSensitiveFields(updated);
}
