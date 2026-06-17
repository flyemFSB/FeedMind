import { eq } from "drizzle-orm";
import type { ToolConfigUpdate, ToolRead, ConfigField } from "@feedmind/contracts";
import { db, tools, type ToolRow } from "@feedmind/db";
import { encryptValue, decryptValue } from "@feedmind/shared";
import { HttpError } from "../../lib/http.js";

// password 类型的字段：不泄露真实值，用 passwordSet 标记是否已配置
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
    description: row.description,
    icon: row.icon,
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

/** Agent 内部使用的运行时端点：返回解密后的配置 */
export async function listToolsRuntime(): Promise<ToolRead[]> {
  const rows = await db.select().from(tools).orderBy(tools.sortOrder);
  return rows.map((row) => {
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
      description: row.description,
      icon: row.icon,
      config_fields: fields,
      config,
      password_set: passwordSet,
      is_enabled: row.isEnabled,
      sort_order: row.sortOrder,
    };
  });
}

export async function getTool(name: string): Promise<ToolRead> {
  const [row] = await db.select().from(tools).where(eq(tools.name, name)).limit(1);
  if (!row) throw new HttpError(404, "HTTP_ERROR", "tool not found");
  return maskSensitiveFields(row);
}

/** 返回单个工具的解密后配置（供前端显示密码字段的真实值） */
export async function getToolRuntime(name: string): Promise<{ config: Record<string, unknown> }> {
  const [row] = await db.select().from(tools).where(eq(tools.name, name)).limit(1);
  if (!row) throw new HttpError(404, "HTTP_ERROR", "tool not found");
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
  if (!row) throw new HttpError(404, "HTTP_ERROR", "tool not found");

  const fields = JSON.parse(row.configFields) as ConfigField[];
  const currentConfig = JSON.parse(row.config) as Record<string, unknown>;

  // 对 password 类型字段加密，非 password 字段直接覆盖
  // payload 中不存在的字段保持原值，空字符串表示清除
  const passwordKeys = new Set(fields.filter((f) => f.type === "password").map((f) => f.key));
  for (const [key, value] of Object.entries(payload.config)) {
    if (passwordKeys.has(key)) {
      currentConfig[key] = typeof value === "string" && value.length > 0 ? encryptValue(value) : "";
    } else {
      currentConfig[key] = value;
    }
  }

  const updatedConfig = JSON.stringify(currentConfig);
  const now = new Date().toISOString();

  const [updated] = await db
    .update(tools)
    .set({
      config: updatedConfig,
      ...(payload.is_enabled !== undefined ? { isEnabled: payload.is_enabled } : {}),
      updatedAt: now,
    })
    .where(eq(tools.name, name))
    .returning();

  return maskSensitiveFields(updated);
}
