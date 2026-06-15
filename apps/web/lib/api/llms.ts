import type { LLMModel } from "@/lib/types";
import { apiFetch, backendApiPath } from "./client";

type LLMModelResponse = {
  id: number;
  provider: string;
  model_name: string;
  model_id: string;
  base_url: string;
  has_api_key: boolean;
  context_window: string | null;
  max_output: string | null;
};

type LLMModelRuntimeResponse = {
  model_name: string;
  model_id: string | null;
  base_url: string;
  api_key: string;
  context_window: string | null;
  max_output: string | null;
};

function toLLMModel(model: LLMModelResponse): LLMModel {
  return {
    id: String(model.id),
    provider: model.provider,
    modelName: model.model_name,
    modelId: model.model_id,
    baseUrl: model.base_url,
    hasApiKey: model.has_api_key,
    contextWindow: model.context_window,
    maxOutput: model.max_output,
  };
}

export async function listLLMModels(signal?: AbortSignal): Promise<LLMModel[]> {
  const data = await apiFetch<LLMModelResponse[]>(backendApiPath("/llms"), { signal });
  return data.map(toLLMModel);
}

export async function createLLMModel(
  payload: Omit<LLMModel, "id" | "hasApiKey"> & { apiKey: string },
): Promise<LLMModel> {
  const data = await apiFetch<LLMModelResponse>(backendApiPath("/llms"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: payload.provider,
      model_name: payload.modelName,
      model_id: payload.modelId ?? "",
      base_url: payload.baseUrl,
      api_key: payload.apiKey,
      context_window: payload.contextWindow ?? null,
      max_output: payload.maxOutput ?? null,
    }),
  });
  return toLLMModel(data);
}

export async function updateLLMModel(
  id: string,
  payload: Omit<LLMModel, "id" | "hasApiKey"> & { apiKey: string },
): Promise<LLMModel> {
  const data = await apiFetch<LLMModelResponse>(backendApiPath(`/llms/${id}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: payload.provider,
      model_name: payload.modelName,
      model_id: payload.modelId ?? "",
      base_url: payload.baseUrl,
      api_key: payload.apiKey,
      context_window: payload.contextWindow ?? null,
      max_output: payload.maxOutput ?? null,
    }),
  });
  return toLLMModel(data);
}

export async function deleteLLMModel(id: string): Promise<void> {
  await apiFetch<{ deleted: boolean }>(backendApiPath(`/llms/${id}`), { method: "DELETE" });
}

export async function getLLMModelRuntime(id: string, signal?: AbortSignal): Promise<LLMModelRuntimeResponse> {
  return apiFetch<LLMModelRuntimeResponse>(backendApiPath(`/llms/${Number(id)}/runtime`), { signal });
}

export async function getSelectedLLMModel(signal?: AbortSignal): Promise<string> {
  const data = await apiFetch<{ id: number | null }>(backendApiPath("/llms/selected"), { signal });
  return data.id ? String(data.id) : "";
}

export async function setSelectedLLMModel(id: string): Promise<string> {
  const data = await apiFetch<{ id: number }>(backendApiPath("/llms/selected"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: Number(id) }),
  });
  return String(data.id);
}
