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
import { decryptValue, encryptValue } from "@feedmind/shared";
import { HttpError } from "../../lib/http.js";
import { clearModelClientCache } from "../../mastra/agents/model-cache.js";

function toModelRead(row: ModelRow): ModelRead {
  return {
    id: row.id,
    type: row.type as "chat" | "embedding",
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
    return toModelRead(row);
  } catch (error) {
    if (isUniqueViolation(error))
      throw new HttpError(
        409,
        "HTTP_ERROR",
        "model with the same type, model ID, endpoint, and API key already exists",
      );
    throw error;
  }
}

export async function updateModel(modelId: number, payload: ModelUpdate): Promise<ModelRead> {
  const values: Partial<ModelInsert> = {
    type: payload.type,
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
    const [row] = await db.update(model).set(values).where(eq(model.id, modelId)).returning();
    if (!row) throw new HttpError(404, "HTTP_ERROR", "model not found");
    clearModelClientCache();
    return toModelRead(row);
  } catch (error) {
    if (isUniqueViolation(error))
      throw new HttpError(
        409,
        "HTTP_ERROR",
        "model with the same type, model ID, endpoint, and API key already exists",
      );
    throw error;
  }
}

export async function deleteModel(modelId: number): Promise<{ deleted: boolean }> {
  const [row] = await db.delete(model).where(eq(model.id, modelId)).returning({ id: model.id });
  if (!row) throw new HttpError(404, "HTTP_ERROR", "model not found");
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
    if (!m) throw new HttpError(404, "HTTP_ERROR", "model not found");
    if (m.type !== modelType)
      throw new HttpError(
        400,
        "HTTP_ERROR",
        `model type mismatch: expected ${modelType}, got ${m.type}`,
      );

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
