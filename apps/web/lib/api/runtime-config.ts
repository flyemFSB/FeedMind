import { apiFetch, backendApiPath, apiPut } from "./client";

export interface RuntimeConfig {
  scenario: string;
  llm_id: number | null;
  model_name?: string;
  provider?: string;
  temperature: number;
  max_tokens: number;
  context_length: string;
  system_prompt: string;
}

export interface RuntimeConfigUpdate {
  llm_id?: number | null;
  temperature?: number;
  max_tokens?: number;
  context_length?: string;
  system_prompt?: string;
}

export async function listRuntimeConfigs(signal?: AbortSignal): Promise<RuntimeConfig[]> {
  return apiFetch<RuntimeConfig[]>(backendApiPath("/runtime-configs"), { signal });
}

export async function updateRuntimeConfig(
  scenario: string,
  payload: RuntimeConfigUpdate,
): Promise<RuntimeConfig> {
  return apiPut<RuntimeConfig>(`/runtime-configs/${scenario}`, payload);
}
