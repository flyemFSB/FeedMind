import { and, eq } from "drizzle-orm";
import type { RuntimeConfigRead, RuntimeConfigUpdate } from "@feedmind/contracts";
import { db, model, runtimeConfig } from "@feedmind/db";
import type { RuntimeConfigRow } from "@feedmind/db";
import { decryptValue } from "@feedmind/shared";
import { HttpError } from "../../lib/http.js";

function toConfigRead(
  row: RuntimeConfigRow,
  modelName?: string,
  modelId?: string,
  provider?: string,
): RuntimeConfigRead {
  return {
    runtime: row.runtime,
    llm_id: row.llmId,
    model_name: modelName,
    model_id: modelId,
    provider,
    temperature: row.temperature,
    top_p: row.topP,
    system_prompt: row.systemPrompt,
  };
}

async function resolveModelName(
  modelId: number | null,
): Promise<{ modelName?: string; modelId?: string; provider?: string }> {
  if (!modelId) return {};
  const [row] = await db
    .select({ modelName: model.modelName, modelId: model.modelId, provider: model.provider })
    .from(model)
    .where(eq(model.id, modelId))
    .limit(1);
  return row ? { modelName: row.modelName, modelId: row.modelId, provider: row.provider } : {};
}

async function resolveSelectedModel(): Promise<{
  llmId: number | null;
  modelName?: string;
  modelId?: string;
  provider?: string;
}> {
  const [row] = await db
    .select({
      id: model.id,
      modelName: model.modelName,
      modelId: model.modelId,
      provider: model.provider,
    })
    .from(model)
    .where(and(eq(model.isSelected, true), eq(model.type, "chat")))
    .limit(1);
  return row
    ? { llmId: row.id, modelName: row.modelName, modelId: row.modelId, provider: row.provider }
    : { llmId: null };
}

export async function getAllConfigs(): Promise<RuntimeConfigRead[]> {
  const rows = await db
    .select({
      config: runtimeConfig,
      modelName: model.modelName,
      modelId: model.modelId,
      provider: model.provider,
    })
    .from(runtimeConfig)
    .leftJoin(model, eq(runtimeConfig.llmId, model.id));

  const selected = await resolveSelectedModel();

  return rows.map(({ config, modelName, modelId, provider }) => {
    if (config.runtime === "session") {
      return toConfigRead(config, selected.modelName, selected.modelId, selected.provider);
    }
    return toConfigRead(
      config,
      modelName ?? undefined,
      modelId ?? undefined,
      provider ?? undefined,
    );
  });
}

export async function getConfig(runtime: string): Promise<RuntimeConfigRead> {
  const [row] = await db
    .select()
    .from(runtimeConfig)
    .where(eq(runtimeConfig.runtime, runtime))
    .limit(1);
  if (!row) throw new HttpError(404, "HTTP_ERROR", `runtime "${runtime}" not found`);

  if (runtime === "session") {
    const selected = await resolveSelectedModel();
    return toConfigRead(row, selected.modelName, selected.modelId, selected.provider);
  }

  const resolved = await resolveModelName(row.llmId);
  return toConfigRead(row, resolved.modelName, resolved.modelId, resolved.provider);
}

export async function updateConfig(
  runtime: string,
  payload: RuntimeConfigUpdate,
): Promise<RuntimeConfigRead> {
  const values: Partial<RuntimeConfigRow> = {
    updatedAt: new Date().toISOString(),
  };
  if (payload.llm_id !== undefined && runtime !== "session") values.llmId = payload.llm_id;
  if (payload.temperature !== undefined) values.temperature = payload.temperature;
  if (payload.top_p !== undefined) values.topP = payload.top_p;
  if (payload.system_prompt !== undefined) values.systemPrompt = payload.system_prompt;

  const [updated] = await db
    .update(runtimeConfig)
    .set(values)
    .where(eq(runtimeConfig.runtime, runtime))
    .returning();

  if (!updated) throw new HttpError(404, "HTTP_ERROR", `runtime "${runtime}" not found`);

  const resolved = await resolveModelName(updated.llmId);
  return toConfigRead(updated, resolved.modelName, resolved.modelId, resolved.provider);
}

export async function getRuntimeConfig(runtime: string): Promise<{
  model_name: string;
  model_id: string;
  base_url: string;
  api_key: string;
  temperature: number;
  top_p: number;
  system_prompt: string;
}> {
  const [row] = await db
    .select()
    .from(runtimeConfig)
    .where(eq(runtimeConfig.runtime, runtime))
    .limit(1);
  if (!row) throw new HttpError(404, "HTTP_ERROR", `runtime "${runtime}" not found`);

  let modelName = "";
  let modelId = "";
  let baseUrl = "";
  let apiKey = "";

  if (runtime === "session") {
    const [m] = await db
      .select()
      .from(model)
      .where(and(eq(model.isSelected, true), eq(model.type, "chat")))
      .limit(1);
    if (m) {
      modelName = m.modelName;
      modelId = m.modelId;
      baseUrl = m.baseUrl;
      apiKey = m.encryptedApiKey ? decryptValue(m.encryptedApiKey) : "";
    }
  } else if (row.llmId) {
    const [m] = await db.select().from(model).where(eq(model.id, row.llmId)).limit(1);
    if (m) {
      modelName = m.modelName;
      modelId = m.modelId;
      baseUrl = m.baseUrl;
      apiKey = m.encryptedApiKey ? decryptValue(m.encryptedApiKey) : "";
    }
  }

  if (!modelName) {
    throw new HttpError(
      400,
      "MODEL_NOT_CONFIGURED",
      `Runtime "${runtime}" 没有关联的模型。请在设置页面 → 模型配置中添加模型并关联到此 runtime。`,
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
    model_id: modelId,
    base_url: baseUrl,
    api_key: apiKey,
    temperature: row.temperature,
    top_p: row.topP,
    system_prompt: row.systemPrompt,
  };
}
