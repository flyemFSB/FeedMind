export type RuntimeConfig = {
  model_name: string;
  base_url: string;
  api_key: string;
};

export function normalizeBaseUrl(baseUrl?: string): string | undefined {
  if (!baseUrl) return undefined;
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) return undefined;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return /^(localhost|127\.0\.0\.1|\[?::1\]?)(?::\d+)?(?:\/|$)/i.test(trimmed)
    ? `http://${trimmed}`
    : `https://${trimmed}`;
}

export function resolveModelId(fallback: string, configurable?: Record<string, unknown>): string {
  const model = configurable?.model;
  return typeof model === "string" && model.trim() ? model.trim() : fallback;
}

export class RuntimeConfigClient {
  private cache = new Map<string, RuntimeConfig>();

  constructor(private backendApiUrl: string) {}

  async getRuntimeConfig(modelId: string, signal?: AbortSignal): Promise<RuntimeConfig> {
    const cached = this.cache.get(modelId);
    if (cached) return cached;

    if (!modelId) {
      throw new Error("No model is selected. Add and select a model in model settings first.");
    }

    const url = `${this.backendApiUrl.replace(/\/$/, "")}/api/v1/llms/${modelId}/runtime`;
    const response = await fetch(url, { signal });
    if (!response.ok) {
      throw new Error(`Failed to load model runtime config: ${response.status}`);
    }
    const payload = (await response.json()) as { data?: RuntimeConfig };
    if (!payload.data) throw new Error("Backend returned an invalid model runtime response.");

    this.cache.set(modelId, payload.data);
    return payload.data;
  }
}
