import { and, asc, eq } from "drizzle-orm";
import type {
  ModelCreate,
  ModelRead,
  ModelRuntimeRead,
  ModelUpdate,
  SelectedModelRead,
  SelectedModelUpdate,
} from "@feedmind/contracts";
import { db, model, type ModelRow, type ModelInsert } from "@feedmind/db";
import { decryptValue, encryptValue } from "../../lib/crypto/fernet.js";
import { HttpError } from "../../lib/http.js";
import { clearModelClientCache } from "./model-cache.js";

function toModelRead(row: ModelRow): ModelRead {
  return {
    id: row.id,
    type: row.type as "chat" | "embedding" | "ocr",
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

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const err = error as { code?: string; message?: string };
  return (
    err.code === "23505" ||
    err.code === "SQLITE_CONSTRAINT_UNIQUE" ||
    /UNIQUE constraint failed/i.test(err.message ?? "")
  );
}

export async function listModels(type?: string): Promise<ModelRead[]> {
  const where = type ? eq(model.type, type) : undefined;
  const rows = await db.select().from(model).where(where).orderBy(asc(model.id));
  return rows.map(toModelRead);
}

export async function createModel(payload: ModelCreate): Promise<ModelRead> {
  try {
    const [row] = await db
      .insert(model)
      .values({
        type: payload.type ?? "chat",
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
    return toModelRead(row!);
  } catch (error) {
    if (isUniqueViolation(error))
      throw new HttpError(409, "HTTP_ERROR", "相同类型、提供商、模型 ID 与接口地址的模型已存在");
    throw error;
  }
}

export async function updateModel(modelId: number, payload: ModelUpdate): Promise<ModelRead> {
  const values: Partial<ModelInsert> = {
    updatedAt: new Date().toISOString(),
    ...(payload.type !== undefined ? { type: payload.type } : {}),
    ...(payload.provider !== undefined ? { provider: payload.provider } : {}),
    ...(payload.model_name !== undefined ? { modelName: payload.model_name } : {}),
    ...(payload.model_id !== undefined ? { modelId: payload.model_id } : {}),
    ...(payload.base_url !== undefined ? { baseUrl: payload.base_url } : {}),
    ...(payload.context_window !== undefined ? { contextWindow: payload.context_window } : {}),
    ...(payload.max_output !== undefined ? { maxOutput: payload.max_output } : {}),
    ...(payload.api_key ? { encryptedApiKey: encryptValue(payload.api_key) } : {}),
  };

  try {
    const [row] = await db.update(model).set(values).where(eq(model.id, modelId)).returning();
    if (!row)
      throw new HttpError(
        404,
        "HTTP_ERROR",
        "模型不存在",
        {},
        { i18nKey: "apiError.modelNotFound" },
      );
    clearModelClientCache();
    return toModelRead(row);
  } catch (error) {
    if (isUniqueViolation(error))
      throw new HttpError(409, "HTTP_ERROR", "相同类型、提供商、模型 ID 与接口地址的模型已存在");
    throw error;
  }
}

export async function deleteModel(modelId: number): Promise<{ deleted: boolean }> {
  const [row] = await db.delete(model).where(eq(model.id, modelId)).returning({ id: model.id });
  if (!row)
    throw new HttpError(404, "HTTP_ERROR", "模型不存在", {}, { i18nKey: "apiError.modelNotFound" });
  clearModelClientCache();
  return { deleted: true };
}

export async function getSelectedModel(modelType: string = "chat"): Promise<SelectedModelRead> {
  const [row] = await db
    .select({ id: model.id })
    .from(model)
    .where(and(eq(model.isSelected, true), eq(model.type, modelType)))
    .limit(1);
  return { id: row?.id ?? null };
}

export async function setSelectedModel(
  payload: SelectedModelUpdate,
  modelType: string = "chat",
): Promise<SelectedModelRead> {
  return db.transaction(async (tx) => {
    const [m] = await tx
      .select({ id: model.id, type: model.type })
      .from(model)
      .where(eq(model.id, payload.id))
      .limit(1);
    if (!m)
      throw new HttpError(
        404,
        "HTTP_ERROR",
        "模型不存在",
        {},
        { i18nKey: "apiError.modelNotFound" },
      );
    if (m.type !== modelType) throw new HttpError(400, "HTTP_ERROR", "模型类型不匹配");

    // 先清空再置位：uq_model_selected_per_type 部分唯一索引禁止同 type 双选中
    await tx
      .update(model)
      .set({ isSelected: false, updatedAt: new Date().toISOString() })
      .where(eq(model.type, modelType));
    await tx
      .update(model)
      .set({ isSelected: true, updatedAt: new Date().toISOString() })
      .where(eq(model.id, payload.id));
    return { id: payload.id };
  });
}

export async function getModelRuntime(modelId: number): Promise<ModelRuntimeRead> {
  const [row] = await db.select().from(model).where(eq(model.id, modelId)).limit(1);
  if (!row)
    throw new HttpError(404, "HTTP_ERROR", "模型不存在", {}, { i18nKey: "apiError.modelNotFound" });

  return {
    provider: row.provider,
    model_name: row.modelName,
    model_id: row.modelId,
    base_url: row.baseUrl,
    api_key: row.encryptedApiKey ? decryptValue(row.encryptedApiKey) : "",
    context_window: row.contextWindow ?? null,
    max_output: row.maxOutput ?? null,
  };
}
