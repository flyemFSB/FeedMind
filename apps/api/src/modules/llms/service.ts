import { asc, eq } from "drizzle-orm";
import type {
  LLMModelCreate,
  LLMModelRead,
  LLMModelRuntimeRead,
  LLMModelUpdate,
  SelectedModelRead,
  SelectedModelUpdate,
} from "@feedmind/contracts";
import { db, llm, type LLMRow } from "@feedmind/db";
import { decryptValue, encryptValue } from "@feedmind/shared";
import { HttpError } from "../../lib/http.js";

function toModelRead(row: LLMRow): LLMModelRead {
  return {
    id: row.id,
    provider: row.provider,
    model_name: row.modelName,
    base_url: row.baseUrl,
    has_api_key: Boolean(row.encryptedApiKey),
    is_selected: row.isSelected,
  };
}

// 检测 PostgreSQL 唯一约束冲突错误码（23505 = unique_violation）
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
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
        baseUrl: payload.base_url,
        encryptedApiKey: payload.api_key ? encryptValue(payload.api_key) : "",
      })
      .returning();
    return toModelRead(row);
  } catch (error) {
    if (isUniqueViolation(error)) throw new HttpError(409, "HTTP_ERROR", "model_name already exists");
    throw error;
  }
}

export async function updateModel(modelId: number, payload: LLMModelUpdate): Promise<LLMModelRead> {
  const values = {
    provider: payload.provider,
    modelName: payload.model_name,
    baseUrl: payload.base_url,
    updatedAt: new Date(),
    ...(payload.api_key ? { encryptedApiKey: encryptValue(payload.api_key) } : {}),
  };

  try {
    const [row] = await db.update(llm).set(values).where(eq(llm.id, modelId)).returning();
    if (!row) throw new HttpError(404, "HTTP_ERROR", "model not found");
    return toModelRead(row);
  } catch (error) {
    if (isUniqueViolation(error)) throw new HttpError(409, "HTTP_ERROR", "model_name already exists");
    throw error;
  }
}

export async function deleteModel(modelId: number): Promise<{ deleted: boolean }> {
  const [row] = await db.delete(llm).where(eq(llm.id, modelId)).returning({ id: llm.id });
  if (!row) throw new HttpError(404, "HTTP_ERROR", "model not found");
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

    await tx.update(llm).set({ isSelected: false, updatedAt: new Date() });
    await tx.update(llm).set({ isSelected: true, updatedAt: new Date() }).where(eq(llm.id, payload.id));
    return { id: payload.id };
  });
}

// 解密返回运行时凭证，Agent 层通过此接口获取模型实际的 api_key 和 base_url
export async function getModelRuntime(modelId: number): Promise<LLMModelRuntimeRead> {
  const [row] = await db.select().from(llm).where(eq(llm.id, modelId)).limit(1);
  if (!row) throw new HttpError(404, "HTTP_ERROR", "model not found");

  return {
    model_name: row.modelName,
    base_url: row.baseUrl,
    api_key: row.encryptedApiKey ? decryptValue(row.encryptedApiKey) : "",
  };
}
