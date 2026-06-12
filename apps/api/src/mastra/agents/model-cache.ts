import { createOpenAI } from "@ai-sdk/openai";
import { getModelRuntime } from "../../modules/llms/service.js";
import { createSanitizedFetch } from "./sanitized-fetch.js";

const modelClientCache = new Map<number, { client: ReturnType<typeof createOpenAI>; modelName: string }>();

export function clearModelClientCache(): void {
  modelClientCache.clear();
}

export async function resolveModelClient(modelId: number): Promise<{ client: ReturnType<typeof createOpenAI>; modelName: string }> {
  const cached = modelClientCache.get(modelId);
  if (cached) return cached;

  const config = await getModelRuntime(modelId);
  const openai = createOpenAI({
    apiKey: config.api_key,
    baseURL: config.base_url || undefined,
    fetch: createSanitizedFetch(config.base_url || undefined),
  });
  const cleanName = config.model_name.includes(":")
    ? config.model_name.split(":").slice(1).join(":")
    : config.model_name;
  const entry = { client: openai, modelName: cleanName };
  modelClientCache.set(modelId, entry);
  return entry;
}
