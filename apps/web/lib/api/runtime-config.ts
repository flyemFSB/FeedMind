import { apiFetch, backendApiPath, apiPut } from "./client";

export interface RuntimeConfig {
  runtime: string;
  llm_id: number | null;
  model_name?: string;
  provider?: string;
  temperature: number;
  top_p: number;
  system_prompt: string;
}

export interface RuntimeConfigUpdate {
  llm_id?: number | null;
  temperature?: number;
  top_p?: number;
  system_prompt?: string;
}

export async function listRuntimeConfigs(signal?: AbortSignal): Promise<RuntimeConfig[]> {
  return apiFetch<RuntimeConfig[]>(backendApiPath("/runtime-configs"), { signal });
}

export async function updateRuntimeConfig(
  runtime: string,
  payload: RuntimeConfigUpdate,
): Promise<RuntimeConfig> {
  return apiPut<RuntimeConfig>(`/runtime-configs/${runtime}`, payload);
}
