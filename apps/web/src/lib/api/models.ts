import type { LLMModel } from "@/lib/types";
import { apiFetch, backendApiPath } from "./client";

export type ModelResponse = {
  id: number;
  type: "chat" | "embedding" | "ocr";
  provider: string;
  model_name: string;
  model_id: string;
  base_url: string;
  has_api_key: boolean;
  context_window: number | null;
  max_output: number | null;
};

export type ModelRuntimeResponse = {
  model_name: string;
  model_id: string | null;
  base_url: string;
  api_key: string;
  context_window: number | null;
  max_output: number | null;
};

/** 表单字符串 → 接口整数（K tokens）；空串/null → null */
function toKInt(v: string | number | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function toLLMModel(model: ModelResponse): LLMModel {
  return {
    id: String(model.id),
    type: model.type,
    provider: model.provider,
    modelName: model.model_name,
    modelId: model.model_id,
    baseUrl: model.base_url,
    hasApiKey: model.has_api_key,
    contextWindow: model.context_window,
    maxOutput: model.max_output,
  };
}

export async function listModels(type?: string, signal?: AbortSignal): Promise<LLMModel[]> {
  const query = type ? `?type=${type}` : "";
  const data = await apiFetch<ModelResponse[]>(backendApiPath(`/models${query}`), { signal });
  return data.map(toLLMModel);
}

export async function createModel(
  payload: Omit<LLMModel, "id" | "hasApiKey"> & { apiKey: string },
): Promise<LLMModel> {
  const data = await apiFetch<ModelResponse>(backendApiPath("/models"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: payload.type ?? "chat",
      provider: payload.provider,
      model_name: payload.modelName,
      model_id: payload.modelId ?? "",
      base_url: payload.baseUrl,
      api_key: payload.apiKey,
      context_window: toKInt(payload.contextWindow),
      max_output: toKInt(payload.maxOutput),
    }),
  });
  return toLLMModel(data);
}

export async function updateModel(
  id: string,
  payload: Omit<LLMModel, "id" | "hasApiKey"> & { apiKey: string },
): Promise<LLMModel> {
  const data = await apiFetch<ModelResponse>(backendApiPath(`/models/${id}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: payload.type,
      provider: payload.provider,
      model_name: payload.modelName,
      model_id: payload.modelId ?? "",
      base_url: payload.baseUrl,
      api_key: payload.apiKey,
      context_window: toKInt(payload.contextWindow),
      max_output: toKInt(payload.maxOutput),
    }),
  });
  return toLLMModel(data);
}

export async function deleteModel(id: string): Promise<void> {
  await apiFetch<{ deleted: boolean }>(backendApiPath(`/models/${id}`), { method: "DELETE" });
}

export async function getModelRuntime(
  id: string,
  signal?: AbortSignal,
): Promise<ModelRuntimeResponse> {
  return apiFetch<ModelRuntimeResponse>(backendApiPath(`/models/${Number(id)}/runtime`), {
    signal,
  });
}

export async function getSelectedModel(type?: string, signal?: AbortSignal): Promise<string> {
  const query = type ? `?type=${type}` : "";
  const data = await apiFetch<{ id: number | null }>(backendApiPath(`/models/selected${query}`), {
    signal,
  });
  return data.id ? String(data.id) : "";
}

export async function setSelectedModel(id: string, type?: string): Promise<string> {
  const query = type ? `?type=${type}` : "";
  const data = await apiFetch<{ id: number }>(backendApiPath(`/models/selected${query}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: Number(id) }),
  });
  return String(data.id);
}
