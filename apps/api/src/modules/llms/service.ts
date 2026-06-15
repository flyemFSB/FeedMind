import { asc, eq } from "drizzle-orm";
import type {
  LLMModelCreate,
  LLMModelRead,
  LLMModelRuntimeRead,
  LLMModelUpdate,
  SelectedModelRead,
  SelectedModelUpdate,
} from "@feedmind/contracts";
import { db, llm, type LLMRow, type LLMInsert } from "@feedmind/db";
import { decryptValue, encryptValue } from "@feedmind/shared";
import { HttpError } from "../../lib/http.js";
import { clearModelClientCache } from "../../mastra/agents/model-cache.js";

function toModelRead(row: LLMRow): LLMModelRead {
  return {
    id: row.id,
    provider: row.provider,
    model_name: row.modelName,
    model_id: row.modelId,
    base_url: row.baseUrl,
    has_api_key: Boolean(row.encryptedApiKey),
    is_selected: row.isSelected,
    context_window: row.contextWindow ?? null,
    max_output: row.maxOutput ?? null,
  };
}

// 检测唯一约束冲突（兼容 PostgreSQL 的 23505 和 SQLite 的 SQLITE_CONSTRAINT_UNIQUE）
function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const err = error as { code?: string; message?: string };
  return err.code === "23505"
    || err.code === "SQLITE_CONSTRAINT_UNIQUE"
    || /UNIQUE constraint failed/i.test(err.message ?? "");
}

export async function listModels(): Promise<LLMModelRead[]> {
  const rows = await db.select().from(llm).orderBy(asc(llm.id));
  return rows.map(toModelRead);
}

export async function createModel(payload: LLMModelCreate): Promise<LLMModelRead> {
  try {
    const [row] = await db
      .insert(llm)
      .values({
        provider: payload.provider,
        modelName: payload.model_name,
        modelId: payload.model_id,
        baseUrl: payload.base_url,
        encryptedApiKey: payload.api_key ? encryptValue(payload.api_key) : "",
        contextWindow: payload.context_window ?? null,
        maxOutput: payload.max_output ?? null,
      })
      .returning();
    clearModelClientCache();
    return toModelRead(row);
  } catch (error) {
    if (isUniqueViolation(error)) throw new HttpError(409, "HTTP_ERROR", "model with the same model ID, endpoint, and API key already exists");
    throw error;
  }
}

export async function updateModel(modelId: number, payload: LLMModelUpdate): Promise<LLMModelRead> {
  const values: Partial<LLMInsert> = {
    provider: payload.provider,
    modelName: payload.model_name,
    modelId: payload.model_id,
    baseUrl: payload.base_url,
    updatedAt: new Date().toISOString(),
    contextWindow: payload.context_window ?? null,
    maxOutput: payload.max_output ?? null,
    ...(payload.api_key ? { encryptedApiKey: encryptValue(payload.api_key) } : {}),
  };

  try {
    const [row] = await db.update(llm).set(values).where(eq(llm.id, modelId)).returning();
    if (!row) throw new HttpError(404, "HTTP_ERROR", "model not found");
    clearModelClientCache();
    return toModelRead(row);
  } catch (error) {
    if (isUniqueViolation(error)) throw new HttpError(409, "HTTP_ERROR", "model with the same model ID, endpoint, and API key already exists");
    throw error;
  }
}

export async function deleteModel(modelId: number): Promise<{ deleted: boolean }> {
  const [row] = await db.delete(llm).where(eq(llm.id, modelId)).returning({ id: llm.id });
  if (!row) throw new HttpError(404, "HTTP_ERROR", "model not found");
  clearModelClientCache();
  return { deleted: true };
}

export async function getSelectedModel(): Promise<SelectedModelRead> {
  const [row] = await db.select({ id: llm.id }).from(llm).where(eq(llm.isSelected, true)).limit(1);
  // 未配置模型是正常空状态，前端据此禁用发送而不是展示错误弹窗。
  return { id: row?.id ?? null };
}

// 在事务中清除所有模型的选中状态，再设置目标模型为选中，保证只有一个模型被选中
export async function setSelectedModel(payload: SelectedModelUpdate): Promise<SelectedModelRead> {
  return db.transaction(async (tx) => {
    const [model] = await tx.select({ id: llm.id }).from(llm).where(eq(llm.id, payload.id)).limit(1);
    if (!model) throw new HttpError(404, "HTTP_ERROR", "model not found");

    await tx.update(llm).set({ isSelected: false, updatedAt: new Date().toISOString() });
    await tx.update(llm).set({ isSelected: true, updatedAt: new Date().toISOString() }).where(eq(llm.id, payload.id));
    return { id: payload.id };
  });
}

// 解密返回运行时凭证，Agent 层通过此接口获取模型实际的 api_key 和 base_url
export async function getModelRuntime(modelId: number): Promise<LLMModelRuntimeRead> {
  const [row] = await db.select().from(llm).where(eq(llm.id, modelId)).limit(1);
  if (!row) throw new HttpError(404, "HTTP_ERROR", "model not found");

  return {
    model_name: row.modelName,
    model_id: row.modelId,
    base_url: row.baseUrl,
    api_key: row.encryptedApiKey ? decryptValue(row.encryptedApiKey) : "",
    context_window: row.contextWindow ?? null,
    max_output: row.maxOutput ?? null,
  };
}
