import { asc, eq } from "drizzle-orm";
import type {
  ModelCreate,
  ModelRead,
  ModelRuntimeRead,
  ModelUpdate,
  SelectedModelRead,
  SelectedModelUpdate,
} from "@feedmind/contracts";
import { db, model, type ModelInsert, type ModelRow } from "@feedmind/db";
import { decryptValue, encryptValue } from "../../lib/crypto/fernet.js";
import { HttpError } from "../../lib/http.js";
import { clearModelClientCache } from "./model-cache.js";

/** 模型用途：决定模型承担的角色；kind 与 usage 的对应关系由 DB CHECK 兜底 */
export const MODEL_USAGES = ["chat", "wiki", "ocr", "embedding"] as const;
export type ModelUsage = (typeof MODEL_USAGES)[number];

const USAGE_KIND: Record<ModelUsage, ModelRow["kind"]> = {
  chat: "chat",
  wiki: "chat",
  ocr: "ocr",
  embedding: "embedding",
};

export function parseModelUsage(raw: string | undefined): ModelUsage {
  const usage = raw ?? "chat";
  if (!(MODEL_USAGES as readonly string[]).includes(usage)) {
    throw new HttpError(400, "HTTP_ERROR", `未知的模型用途: ${usage}`);
  }
  return usage as ModelUsage;
}

/** 某用途在 UI 上的展示名 */
export function usageLabel(usage: ModelUsage): string {
  return usage === "chat" ? "对话模型" : usage === "wiki" ? "知识导入模型" : usage;
}

function toModelRead(row: ModelRow): ModelRead {
  // 「使用中」= 该 kind 的默认用途绑定在这行上（chat 类模型的 wiki 专用绑定不显示为选中）
  const defaultUsage = row.kind === "chat" ? "chat" : row.kind;
  return {
    id: row.id,
    type: row.kind as ModelRead["type"],
    provider: row.provider,
    model_name: row.name,
    model_id: row.apiModel,
    base_url: row.baseUrl,
    has_api_key: Boolean(row.apiKey),
    is_selected: row.usage === defaultUsage,
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

export async function listModels(kind?: string): Promise<ModelRead[]> {
  const rows = await db
    .select()
    .from(model)
    .where(kind ? eq(model.kind, kind) : undefined)
    .orderBy(asc(model.id));
  return rows.map(toModelRead);
}

export async function createModel(payload: ModelCreate): Promise<ModelRead> {
  try {
    const [row] = await db
      .insert(model)
      .values({
        kind: payload.type ?? "chat",
        provider: payload.provider,
        name: payload.model_name,
        apiModel: payload.model_id,
        baseUrl: payload.base_url,
        apiKey: payload.api_key ? encryptValue(payload.api_key) : "",
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
    ...(payload.type !== undefined ? { kind: payload.type } : {}),
    ...(payload.provider !== undefined ? { provider: payload.provider } : {}),
    ...(payload.model_name !== undefined ? { name: payload.model_name } : {}),
    ...(payload.model_id !== undefined ? { apiModel: payload.model_id } : {}),
    ...(payload.base_url !== undefined ? { baseUrl: payload.base_url } : {}),
    ...(payload.context_window !== undefined ? { contextWindow: payload.context_window } : {}),
    ...(payload.max_output !== undefined ? { maxOutput: payload.max_output } : {}),
    ...(payload.api_key ? { apiKey: encryptValue(payload.api_key) } : {}),
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

/** 用途绑定的模型 id；未绑定返回 null */
export async function getSelectedModel(usage: ModelUsage): Promise<SelectedModelRead> {
  const [row] = await db
    .select({ id: model.id })
    .from(model)
    .where(eq(model.usage, usage))
    .limit(1);
  return { id: row?.id ?? null };
}

/** 绑定用途：先清空同用途的旧绑定，再置位（uq_model_usage 部分唯一索引兜底） */
export async function setSelectedModel(
  payload: SelectedModelUpdate,
  usage: ModelUsage,
): Promise<SelectedModelRead> {
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select({ id: model.id, kind: model.kind })
      .from(model)
      .where(eq(model.id, payload.id))
      .limit(1);
    if (!target)
      throw new HttpError(
        404,
        "HTTP_ERROR",
        "模型不存在",
        {},
        { i18nKey: "apiError.modelNotFound" },
      );
    if (target.kind !== USAGE_KIND[usage]) {
      throw new HttpError(
        400,
        "HTTP_ERROR",
        `模型类型与用途不匹配：${usage} 需要 ${USAGE_KIND[usage]} 类模型`,
      );
    }

    const now = new Date().toISOString();
    await tx.update(model).set({ usage: null, updatedAt: now }).where(eq(model.usage, usage));
    await tx.update(model).set({ usage, updatedAt: now }).where(eq(model.id, payload.id));
    return { id: payload.id };
  });
}

/** 解除用途绑定（回退到该用途的默认行为） */
export async function clearSelectedModel(usage: ModelUsage): Promise<SelectedModelRead> {
  await db
    .update(model)
    .set({ usage: null, updatedAt: new Date().toISOString() })
    .where(eq(model.usage, usage));
  return { id: null };
}

export async function getModelRuntime(modelId: number): Promise<ModelRuntimeRead> {
  const [row] = await db.select().from(model).where(eq(model.id, modelId)).limit(1);
  if (!row)
    throw new HttpError(404, "HTTP_ERROR", "模型不存在", {}, { i18nKey: "apiError.modelNotFound" });

  return {
    provider: row.provider,
    model_name: row.name,
    model_id: row.apiModel,
    base_url: row.baseUrl,
    api_key: row.apiKey ? decryptValue(row.apiKey) : "",
    context_window: row.contextWindow ?? null,
    max_output: row.maxOutput ?? null,
  };
}
