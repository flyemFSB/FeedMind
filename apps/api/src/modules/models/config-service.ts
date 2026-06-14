import { asc, eq } from "drizzle-orm";
import type { RuntimeConfigRead, RuntimeConfigUpdate } from "@feedmind/contracts";
import { db, llm, runtimeConfig, type RuntimeConfigRow } from "@feedmind/db";
import { decryptValue } from "@feedmind/shared";
import { HttpError } from "../../lib/http.js";

function toConfigRead(row: RuntimeConfigRow, modelName?: string, provider?: string): RuntimeConfigRead {
  return {
    scenario: row.scenario,
    llm_id: row.llmId,
    model_name: modelName,
    provider,
    temperature: row.temperature,
    max_output_tokens: row.maxOutputTokens,
    top_p: row.topP,
    context_length: row.contextLength,
    system_prompt: row.systemPrompt,
  };
}

async function resolveModelName(llmId: number | null): Promise<{ modelName?: string; provider?: string }> {
  if (!llmId) return {};
  const [row] = await db.select({ modelName: llm.modelName, provider: llm.provider }).from(llm).where(eq(llm.id, llmId)).limit(1);
  return row ? { modelName: row.modelName, provider: row.provider } : {};
}

/** session 场景在 UI 层面不存自己的 llm_id，直接读 llm 表的选中模型 */
async function resolveSelectedModel(): Promise<{ llmId: number | null; modelName?: string; provider?: string }> {
  const [row] = await db.select({ id: llm.id, modelName: llm.modelName, provider: llm.provider }).from(llm).where(eq(llm.isSelected, true)).limit(1);
  return row ? { llmId: row.id, modelName: row.modelName, provider: row.provider } : { llmId: null };
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
    if (config.scenario === "session") {
      return toConfigRead(config, selected.modelName, selected.provider);
    }
    return toConfigRead(config, modelName ?? undefined, provider ?? undefined);
  });
}

export async function getConfig(scenario: string): Promise<RuntimeConfigRead> {
  const [row] = await db.select().from(runtimeConfig).where(eq(runtimeConfig.scenario, scenario)).limit(1);
  if (!row) throw new HttpError(404, "HTTP_ERROR", `scenario "${scenario}" not found`);

  if (scenario === "session") {
    const selected = await resolveSelectedModel();
    return toConfigRead(row, selected.modelName, selected.provider);
  }

  const resolved = await resolveModelName(row.llmId);
  return toConfigRead(row, resolved.modelName, resolved.provider);
}

export async function updateConfig(scenario: string, payload: RuntimeConfigUpdate): Promise<RuntimeConfigRead> {
  const values: Partial<typeof runtimeConfig.$inferInsert> = { updatedAt: new Date().toISOString() };
  // session 场景不存储自己的 llm_id，忽略该字段
  if (payload.llm_id !== undefined && scenario !== "session") values.llmId = payload.llm_id;
  if (payload.temperature !== undefined) values.temperature = payload.temperature;
  if (payload.max_output_tokens !== undefined) values.maxOutputTokens = payload.max_output_tokens;
  if (payload.top_p !== undefined) values.topP = payload.top_p;
  if (payload.context_length !== undefined) values.contextLength = payload.context_length;
  if (payload.system_prompt !== undefined) values.systemPrompt = payload.system_prompt;

  const [row] = await db
    .update(runtimeConfig)
    .set(values)
    .where(eq(runtimeConfig.scenario, scenario))
    .returning();

  if (!row) throw new HttpError(404, "HTTP_ERROR", `scenario "${scenario}" not found`);
  const resolved = await resolveModelName(row.llmId);
  return toConfigRead(row, resolved.modelName, resolved.provider);
}

/** 内部使用：返回场景的完整运行时凭据（解密后的 API key） */
export async function getRuntimeConfig(scenario: string): Promise<{
  model_name: string;
  base_url: string;
  api_key: string;
  temperature: number;
  max_output_tokens: number;
  top_p: number;
  context_length: string;
  system_prompt: string;
}> {
  const [cfg] = await db.select().from(runtimeConfig).where(eq(runtimeConfig.scenario, scenario)).limit(1);
  if (!cfg) throw new HttpError(404, "HTTP_ERROR", `scenario "${scenario}" not found`);

  let modelName = "";
  let baseUrl = "";
  let apiKey = "";

  if (scenario === "session") {
    // session 场景跟随聊天页选中模型
    const [sel] = await db.select().from(llm).where(eq(llm.isSelected, true)).limit(1);
    if (sel) {
      modelName = sel.modelName;
      baseUrl = sel.baseUrl;
      apiKey = sel.encryptedApiKey ? decryptValue(sel.encryptedApiKey) : "";
    }
  } else if (cfg.llmId) {
    const [model] = await db.select().from(llm).where(eq(llm.id, cfg.llmId)).limit(1);
    if (model) {
      modelName = model.modelName;
      baseUrl = model.baseUrl;
      apiKey = model.encryptedApiKey ? decryptValue(model.encryptedApiKey) : "";
    }
  }

  // fallback to env vars when no llm is linked
  if (!modelName && scenario === "wiki") {
    modelName = process.env.WIKI_LLM_MODEL || "gpt-4o";
    baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
    apiKey = process.env.OPENAI_API_KEY || "";
  }

  // 有模型名但没有 API key → 凭据缺失，提前报错
  if (modelName && !apiKey && !baseUrl) {
    throw new Error(
      `[config] Scenario "${scenario}": model "${modelName}" is configured but has no valid API key or base URL. ` +
      "Please add a model with credentials in Settings → Model Config.",
    );
  }

  return {
    model_name: modelName,
    base_url: baseUrl,
    api_key: apiKey,
    temperature: cfg.temperature,
    max_output_tokens: cfg.maxOutputTokens,
    top_p: cfg.topP,
    context_length: cfg.contextLength,
    system_prompt: cfg.systemPrompt,
  };
}
