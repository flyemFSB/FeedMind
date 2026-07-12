import type { RuntimeConfigRead, RuntimeConfigUpdate } from "@feedmind/contracts";
import { client } from "@feedmind/db";
import { decryptValue } from "@feedmind/shared";
import { HttpError } from "../../lib/http.js";

interface ConfigRow {
  id: number;
  runtime: string;
  llm_id: number | null;
  temperature: number;
  top_p: number;
  system_prompt: string;
  updated_at: string;
}

function configToRead(row: ConfigRow, modelName?: string, provider?: string): RuntimeConfigRead {
  return {
    runtime: row.runtime,
    llm_id: row.llm_id,
    model_name: modelName,
    provider,
    temperature: row.temperature,
    top_p: row.top_p,
    system_prompt: row.system_prompt,
  };
}

async function resolveModelName(
  llmId: number | null,
): Promise<{ modelName?: string; provider?: string }> {
  if (!llmId) return {};
  const result = await client.execute({
    sql: "SELECT model_name, provider FROM llm WHERE id = ?",
    args: [llmId],
  });
  const row = result.rows[0] as any;
  return row ? { modelName: row.model_name, provider: row.provider } : {};
}

async function resolveSelectedModel(): Promise<{
  llmId: number | null;
  modelName?: string;
  provider?: string;
}> {
  const result = await client.execute(
    "SELECT id, model_name, provider FROM llm WHERE is_selected = 1 LIMIT 1",
  );
  const row = result.rows[0] as any;
  return row
    ? { llmId: row.id, modelName: row.model_name, provider: row.provider }
    : { llmId: null };
}

export async function getAllConfigs(): Promise<RuntimeConfigRead[]> {
  const result = await client.execute(
    "SELECT c.*, m.model_name, m.provider FROM runtime_config c LEFT JOIN llm m ON c.llm_id = m.id",
  );
  const selected = await resolveSelectedModel();

  return result.rows.map((r: any) => {
    const config: ConfigRow = {
      id: r.id,
      runtime: r.runtime,
      llm_id: r.llm_id,
      temperature: r.temperature,
      top_p: r.top_p,
      system_prompt: r.system_prompt,
      updated_at: r.updated_at,
    };
    if (config.runtime === "session") {
      return configToRead(config, selected.modelName, selected.provider);
    }
    return configToRead(config, r.model_name ?? undefined, r.provider ?? undefined);
  });
}

export async function getConfig(runtime: string): Promise<RuntimeConfigRead> {
  const result = await client.execute({
    sql: "SELECT * FROM runtime_config WHERE runtime = ?",
    args: [runtime],
  });
  const row = result.rows[0] as any;
  if (!row) throw new HttpError(404, "HTTP_ERROR", `runtime "${runtime}" not found`);

  const config: ConfigRow = {
    id: row.id,
    runtime: row.runtime,
    llm_id: row.llm_id,
    temperature: row.temperature,
    top_p: row.top_p,
    system_prompt: row.system_prompt,
    updated_at: row.updated_at,
  };

  if (runtime === "session") {
    const selected = await resolveSelectedModel();
    return configToRead(config, selected.modelName, selected.provider);
  }

  const resolved = await resolveModelName(config.llm_id);
  return configToRead(config, resolved.modelName, resolved.provider);
}

export async function updateConfig(
  runtime: string,
  payload: RuntimeConfigUpdate,
): Promise<RuntimeConfigRead> {
  const sets: string[] = ["updated_at = ?"];
  const binds: any[] = [new Date().toISOString()];
  const cols: string[] = [];

  if (payload.llm_id !== undefined && runtime !== "session") {
    sets.push("llm_id = ?");
    binds.push(payload.llm_id);
    cols.push("llm_id");
  }
  if (payload.temperature !== undefined) {
    sets.push("temperature = ?");
    binds.push(payload.temperature);
    cols.push("temperature");
  }
  if (payload.top_p !== undefined) {
    sets.push("top_p = ?");
    binds.push(payload.top_p);
    cols.push("top_p");
  }
  if (payload.system_prompt !== undefined) {
    sets.push("system_prompt = ?");
    binds.push(payload.system_prompt);
    cols.push("system_prompt");
  }

  binds.push(runtime);

  const before = await client.execute({
    sql: "SELECT id FROM runtime_config WHERE runtime = ?",
    args: [runtime],
  });
  if (!before.rows[0]) throw new HttpError(404, "HTTP_ERROR", `runtime "${runtime}" not found`);

  await client.execute({
    sql: `UPDATE runtime_config SET ${sets.join(", ")} WHERE runtime = ?`,
    args: binds,
  });

  const result = await client.execute({
    sql: "SELECT * FROM runtime_config WHERE runtime = ?",
    args: [runtime],
  });
  const row = result.rows[0] as any;
  if (!row) throw new HttpError(404, "HTTP_ERROR", `runtime "${runtime}" not found`);

  const config: ConfigRow = {
    id: row.id,
    runtime: row.runtime,
    llm_id: row.llm_id,
    temperature: row.temperature,
    top_p: row.top_p,
    system_prompt: row.system_prompt,
    updated_at: row.updated_at,
  };
  const resolved = await resolveModelName(config.llm_id);
  return configToRead(config, resolved.modelName, resolved.provider);
}

export async function getRuntimeConfig(runtime: string): Promise<{
  model_name: string;
  base_url: string;
  api_key: string;
  temperature: number;
  top_p: number;
  system_prompt: string;
}> {
  const result = await client.execute({
    sql: "SELECT * FROM runtime_config WHERE runtime = ?",
    args: [runtime],
  });
  const row = result.rows[0] as any;
  if (!row) throw new HttpError(404, "HTTP_ERROR", `runtime "${runtime}" not found`);

  let modelName = "";
  let baseUrl = "";
  let apiKey = "";

  if (runtime === "session") {
    const sel = await client.execute("SELECT * FROM llm WHERE is_selected = 1 LIMIT 1");
    const model = sel.rows[0] as any;
    if (model) {
      modelName = model.model_name;
      baseUrl = model.base_url;
      apiKey = model.encrypted_api_key ? decryptValue(model.encrypted_api_key) : "";
    }
  } else if (row.llm_id) {
    const modelResult = await client.execute({
      sql: "SELECT * FROM llm WHERE id = ?",
      args: [row.llm_id],
    });
    const model = modelResult.rows[0] as any;
    if (model) {
      modelName = model.model_name;
      baseUrl = model.base_url;
      apiKey = model.encrypted_api_key ? decryptValue(model.encrypted_api_key) : "";
    }
  }

  if (!modelName) {
    throw new HttpError(
      400,
      "MODEL_NOT_CONFIGURED",
      `Runtime "${runtime}" 没有关联的 LLM 模型。请在设置页面 → 模型配置中添加模型并关联到此 runtime。`,
    );
  }

  if (modelName && !apiKey && !baseUrl) {
    throw new Error(
      `[config] Runtime "${runtime}": model "${modelName}" is configured but has no valid API key or base URL. ` +
        "Please add a model with credentials in Settings → Model Config.",
    );
  }

  return {
    model_name: modelName,
    base_url: baseUrl,
    api_key: apiKey,
    temperature: row.temperature,
    top_p: row.top_p,
    system_prompt: row.system_prompt,
  };
}
