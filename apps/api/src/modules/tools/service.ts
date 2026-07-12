import type { ToolConfigUpdate, ToolRead, ConfigField } from "@feedmind/contracts";
import { client } from "@feedmind/db";
import { encryptValue, decryptValue } from "@feedmind/shared";
import { HttpError } from "../../lib/http.js";

function maskSensitiveFields(row: any): ToolRead {
  const fields = JSON.parse(row.config_fields) as ConfigField[];
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
    display_name: row.display_name,
    description: row.description ?? null,
    icon: row.icon ?? null,
    config_fields: fields,
    config,
    password_set: passwordSet,
    is_enabled: !!row.is_enabled,
    sort_order: row.sort_order,
  };
}

function decryptRow(row: any): ToolRead {
  const fields = JSON.parse(row.config_fields) as ConfigField[];
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
    display_name: row.display_name,
    description: row.description ?? null,
    icon: row.icon ?? null,
    config_fields: fields,
    config,
    password_set: passwordSet,
    is_enabled: !!row.is_enabled,
    sort_order: row.sort_order,
  };
}

export async function listTools(): Promise<ToolRead[]> {
  const result = await client.execute("SELECT * FROM tools ORDER BY sort_order");
  return result.rows.map(maskSensitiveFields);
}

export async function listToolsRuntime(): Promise<ToolRead[]> {
  const result = await client.execute("SELECT * FROM tools ORDER BY sort_order");
  return result.rows.map(decryptRow);
}

export async function getTool(name: string): Promise<ToolRead> {
  const result = await client.execute({ sql: "SELECT * FROM tools WHERE name = ?", args: [name] });
  if (!result.rows[0]) throw new HttpError(404, "HTTP_ERROR", "tool not found");
  return maskSensitiveFields(result.rows[0]);
}

export async function getToolRuntime(name: string): Promise<{ config: Record<string, unknown> }> {
  const result = await client.execute({ sql: "SELECT * FROM tools WHERE name = ?", args: [name] });
  if (!result.rows[0]) throw new HttpError(404, "HTTP_ERROR", "tool not found");
  const row = result.rows[0] as any;
  const fields = JSON.parse(row.config_fields) as ConfigField[];
  const config: Record<string, unknown> = JSON.parse(row.config);
  for (const f of fields) {
    if (f.type === "password" && typeof config[f.key] === "string" && config[f.key]) {
      config[f.key] = decryptValue(config[f.key] as string);
    }
  }
  return { config };
}

export async function updateToolConfig(name: string, payload: ToolConfigUpdate): Promise<ToolRead> {
  const result = await client.execute({ sql: "SELECT * FROM tools WHERE name = ?", args: [name] });
  if (!result.rows[0]) throw new HttpError(404, "HTTP_ERROR", "tool not found");
  const row = result.rows[0] as any;

  const fields = JSON.parse(row.config_fields) as ConfigField[];
  const currentConfig = JSON.parse(row.config) as Record<string, unknown>;

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
  const enabled = payload.is_enabled !== undefined ? (payload.is_enabled ? 1 : 0) : undefined;

  if (enabled !== undefined) {
    await client.execute({
      sql: "UPDATE tools SET config = ?, is_enabled = ?, updated_at = ? WHERE name = ?",
      args: [updatedConfig, enabled, now, name],
    });
  } else {
    await client.execute({
      sql: "UPDATE tools SET config = ?, updated_at = ? WHERE name = ?",
      args: [updatedConfig, now, name],
    });
  }

  const updated = await client.execute({ sql: "SELECT * FROM tools WHERE name = ?", args: [name] });
  if (!updated.rows[0]) throw new HttpError(500, "INTERNAL", "update failed");
  return maskSensitiveFields(updated.rows[0]);
}
