import { createOpenAI } from "@ai-sdk/openai";
import { getModelRuntime } from "../../modules/models/service.js";
import { createSanitizedFetch } from "./sanitized-fetch.js";

export interface ResolvedModel {
  client: ReturnType<typeof createOpenAI>;
  modelName: string;
  contextWindow: string | null;
  maxOutput: string | null;
}

const modelClientCache = new Map<number, ResolvedModel>();

export function clearModelClientCache(): void {
  modelClientCache.clear();
}

export async function resolveModelClient(modelId: number): Promise<ResolvedModel> {
  const cached = modelClientCache.get(modelId);
  if (cached) return cached;

  const config = await getModelRuntime(modelId);
  const openai = createOpenAI({
    apiKey: config.api_key,
    baseURL: config.base_url || undefined,
    fetch: createSanitizedFetch(config.base_url || undefined),
  });
  const cleanName = config.model_id?.trim() || "";
  const entry: ResolvedModel = {
    client: openai,
    modelName: cleanName,
    contextWindow: config.context_window,
    maxOutput: config.max_output,
  };
  modelClientCache.set(modelId, entry);
  return entry;
}
