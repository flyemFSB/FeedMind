import { and, eq } from "drizzle-orm";
import type { RuntimeConfigRead, RuntimeConfigUpdate } from "@feedmind/contracts";
import { db, model, runtimeConfig } from "@feedmind/db";
import type { RuntimeConfigRow } from "@feedmind/db";
import { decryptValue } from "../../lib/crypto/fernet.js";
import { HttpError } from "../../lib/http.js";

interface ResolvedModelInfo {
  llmId: number | null;
  modelName?: string | undefined;
  modelId?: string | undefined;
  provider?: string | undefined;
}

/**
 * 有效模型来源的唯一判据：session 永远跟全局选中模型；wiki 未独立指定（或指向已删模型）
 * 时同样回退全局；其余运行时按自身 llmId。
 */
function shouldUseSelectedModel(runtime: string, hasOwnModel: boolean): boolean {
  return runtime === "session" || (runtime === "wiki" && !hasOwnModel);
}

function toConfigRead(row: RuntimeConfigRow, effective: ResolvedModelInfo): RuntimeConfigRead {
  return {
    runtime: row.runtime,
    llm_id: effective.llmId,
    model_name: effective.modelName,
    model_id: effective.modelId,
    provider: effective.provider,
    temperature: row.temperature,
    top_p: row.topP,
    system_prompt: row.systemPrompt,
  };
}

async function loadModelRow(id: number | null) {
  if (!id) return undefined;
  const [row] = await db.select().from(model).where(eq(model.id, id)).limit(1);
  return row;
}

async function loadSelectedChatModelRow() {
  const [row] = await db
    .select()
    .from(model)
    .where(and(eq(model.isSelected, true), eq(model.type, "chat")))
    .limit(1);
  return row;
}

async function resolveModelName(modelId: number | null): Promise<Partial<ResolvedModelInfo>> {
  const row = await loadModelRow(modelId);
  return row ? { modelName: row.modelName, modelId: row.modelId, provider: row.provider } : {};
}

async function resolveSelectedModel(): Promise<ResolvedModelInfo> {
  const row = await loadSelectedChatModelRow();
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
    const own = {
      modelName: modelName ?? undefined,
      modelId: modelId ?? undefined,
      provider: provider ?? undefined,
    };
    const effective = shouldUseSelectedModel(config.runtime, Boolean(own.modelName))
      ? selected
      : { llmId: config.llmId, ...own };
    return toConfigRead(config, effective);
  });
}

export async function getConfig(runtime: string): Promise<RuntimeConfigRead> {
  const [row] = await db
    .select()
    .from(runtimeConfig)
    .where(eq(runtimeConfig.runtime, runtime))
    .limit(1);
  if (!row)
    throw new HttpError(
      404,
      "HTTP_ERROR",
      "运行配置不存在",
      {},
      { i18nKey: "apiError.runtimeConfigNotFound" },
    );

  const own = await resolveModelName(row.llmId);
  const effective = shouldUseSelectedModel(runtime, Boolean(own.modelName))
    ? await resolveSelectedModel()
    : { llmId: row.llmId, ...own };
  return toConfigRead(row, effective);
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

  if (!updated)
    throw new HttpError(
      404,
      "HTTP_ERROR",
      "运行配置不存在",
      {},
      { i18nKey: "apiError.runtimeConfigNotFound" },
    );

  const effective = { llmId: updated.llmId, ...(await resolveModelName(updated.llmId)) };
  return toConfigRead(updated, effective);
}

/** 文档解析（OCR）模型配置：model 表 type=ocr 且 is_selected 的条目；
 * 未配置返回 null——VL 是 PDF 导入的增强路径，调用方应降级本地解析而非报错 */
export async function getRuntimeOcrConfig(): Promise<{
  baseUrl: string;
  apiKey: string;
} | null> {
  const [row] = await db
    .select()
    .from(model)
    .where(and(eq(model.type, "ocr"), eq(model.isSelected, true)))
    .limit(1);
  if (!row || !row.encryptedApiKey) return null;
  return { baseUrl: row.baseUrl, apiKey: decryptValue(row.encryptedApiKey) };
}

export async function getRuntimeConfig(runtime: string): Promise<{
  model_name: string;
  model_id: string;
  llm_id: number | null;
  base_url: string;
  api_key: string;
  max_output: string;
  temperature: number;
  top_p: number;
  system_prompt: string;
}> {
  const [row] = await db
    .select()
    .from(runtimeConfig)
    .where(eq(runtimeConfig.runtime, runtime))
    .limit(1);
  if (!row)
    throw new HttpError(
      404,
      "HTTP_ERROR",
      "运行配置不存在",
      {},
      { i18nKey: "apiError.runtimeConfigNotFound" },
    );

  const own = await loadModelRow(row.llmId);
  const active = shouldUseSelectedModel(row.runtime, Boolean(own))
    ? await loadSelectedChatModelRow()
    : own;

  const modelName = active?.modelName ?? "";
  const modelId = active?.modelId ?? "";
  const baseUrl = active?.baseUrl ?? "";
  const apiKey = active?.encryptedApiKey ? decryptValue(active.encryptedApiKey) : "";
  const maxOutput = active?.maxOutput != null ? String(active.maxOutput) : "";
  const llmId = active?.id ?? null;

  if (!modelName) {
    throw new HttpError(
      400,
      "MODEL_NOT_CONFIGURED",
      `Runtime "${runtime}" 没有关联的模型。请在设置页面 → 模型配置中添加模型并关联到此 runtime。`,
      {},
      {
        i18nKey: "apiError.modelNotConfigured",
        i18nParams: { runtime },
      },
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
    llm_id: llmId,
    base_url: baseUrl,
    api_key: apiKey,
    max_output: maxOutput,
    temperature: row.temperature,
    top_p: row.topP,
    system_prompt: row.systemPrompt,
  };
}
