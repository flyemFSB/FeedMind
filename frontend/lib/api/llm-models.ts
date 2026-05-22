import type { LLMModel } from "@/lib/types";
import { apiFetch } from "./client";

type LLMModelResponse = {
  id: number;
  provider: string;
  model_name: string;
  base_url: string;
  has_api_key: boolean;
};

type LLMModelRuntimeResponse = {
  model_name: string;
  base_url: string;
  api_key: string;
};

function toLLMModel(model: LLMModelResponse): LLMModel {
  return {
    id: String(model.id),
    provider: model.provider,
    modelName: model.model_name,
    baseUrl: model.base_url,
    hasApiKey: model.has_api_key,
  };
}

export async function listLLMModels(signal?: AbortSignal): Promise<LLMModel[]> {
  const data = await apiFetch<LLMModelResponse[]>("/api/models", { signal });
  return data.map(toLLMModel);
}

export async function createLLMModel(
  payload: Omit<LLMModel, "id" | "hasApiKey"> & { apiKey: string },
): Promise<LLMModel> {
  const data = await apiFetch<LLMModelResponse>("/api/models", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: payload.provider,
      model_name: payload.modelName,
      base_url: payload.baseUrl,
      api_key: payload.apiKey,
    }),
  });
  return toLLMModel(data);
}

export async function updateLLMModel(
  id: string,
  payload: Omit<LLMModel, "id" | "hasApiKey"> & { apiKey: string },
): Promise<LLMModel> {
  const data = await apiFetch<LLMModelResponse>(`/api/models/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: payload.provider,
      model_name: payload.modelName,
      base_url: payload.baseUrl,
      api_key: payload.apiKey,
    }),
  });
  return toLLMModel(data);
}

export async function deleteLLMModel(id: string): Promise<void> {
  await apiFetch<{ deleted: boolean }>(`/api/models/${id}`, { method: "DELETE" });
}

export async function getLLMModelRuntime(id: string, signal?: AbortSignal): Promise<LLMModelRuntimeResponse> {
  return apiFetch<LLMModelRuntimeResponse>(`/api/models/runtime?id=${Number(id)}`, { signal });
}

export async function getSelectedLLMModel(signal?: AbortSignal): Promise<string> {
  try {
    const data = await apiFetch<{ id: number }>("/api/models/selected", { signal });
    return String(data.id);
  } catch {
    return "";
  }
}

export async function setSelectedLLMModel(id: string): Promise<string> {
  const data = await apiFetch<{ id: number }>("/api/models/selected", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: Number(id) }),
  });
  return String(data.id);
}
