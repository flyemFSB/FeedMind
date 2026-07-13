import { eq } from "drizzle-orm";
import type { RuntimeConfigRead, RuntimeConfigUpdate } from "@feedmind/contracts";
import { db, llm, runtimeConfig } from "@feedmind/db";
import type { RuntimeConfigRow } from "@feedmind/db";
import { decryptValue } from "@feedmind/shared";
import { HttpError } from "../../lib/http.js";

function toConfigRead(
  row: RuntimeConfigRow,
  modelName?: string,
  provider?: string,
): RuntimeConfigRead {
  return {
    runtime: row.runtime,
    llm_id: row.llmId,
    model_name: modelName,
    provider,
    temperature: row.temperature,
    top_p: row.topP,
    system_prompt: row.systemPrompt,
  };
}

async function resolveModelName(
  llmId: number | null,
): Promise<{ modelName?: string; provider?: string }> {
  if (!llmId) return {};
  const [row] = await db
    .select({ modelName: llm.modelName, provider: llm.provider })
    .from(llm)
    .where(eq(llm.id, llmId))
    .limit(1);
  return row ? { modelName: row.modelName, provider: row.provider } : {};
}

/** session 场景在 UI 层面不存自己的 llm_id，直接读 llm 表的选中模型 */
async function resolveSelectedModel(): Promise<{
  llmId: number | null;
  modelName?: string;
  provider?: string;
}> {
  const [row] = await db
    .select({ id: llm.id, modelName: llm.modelName, provider: llm.provider })
    .from(llm)
    .where(eq(llm.isSelected, true))
    .limit(1);
  return row
    ? { llmId: row.id, modelName: row.modelName, provider: row.provider }
    : { llmId: null };
}

export async function getAllConfigs(): Promise<RuntimeConfigRead[]> {
  const rows = await db
    .select({
      config: runtimeConfig,
      modelName: llm.modelName,
      provider: llm.provider,
    })
    .from(runtimeConfig)
    .leftJoin(llm, eq(runtimeConfig.llmId, llm.id));

  const selected = await resolveSelectedModel();

  return rows.map(({ config, modelName, provider }) => {
    if (config.runtime === "session") {
      return toConfigRead(config, selected.modelName, selected.provider);
    }
    return toConfigRead(config, modelName ?? undefined, provider ?? undefined);
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
    return toConfigRead(row, selected.modelName, selected.provider);
  }

  const resolved = await resolveModelName(row.llmId);
  return toConfigRead(row, resolved.modelName, resolved.provider);
}

export async function updateConfig(
  runtime: string,
  payload: RuntimeConfigUpdate,
): Promise<RuntimeConfigRead> {
  const values: Partial<RuntimeConfigRow> = {
    updatedAt: new Date().toISOString(),
  };
  // session 运行配置不存储自己的 llm_id，忽略该字段
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
  return toConfigRead(updated, resolved.modelName, resolved.provider);
}

export async function getRuntimeConfig(runtime: string): Promise<{
  model_name: string;
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
  let baseUrl = "";
  let apiKey = "";

  if (runtime === "session") {
    const [model] = await db.select().from(llm).where(eq(llm.isSelected, true)).limit(1);
    if (model) {
      modelName = model.modelName;
      baseUrl = model.baseUrl;
      apiKey = model.encryptedApiKey ? decryptValue(model.encryptedApiKey) : "";
    }
  } else if (row.llmId) {
    const [model] = await db.select().from(llm).where(eq(llm.id, row.llmId)).limit(1);
    if (model) {
      modelName = model.modelName;
      baseUrl = model.baseUrl;
      apiKey = model.encryptedApiKey ? decryptValue(model.encryptedApiKey) : "";
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
    top_p: row.topP,
    system_prompt: row.systemPrompt,
  };
}
