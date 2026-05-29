import type { RunnableConfig } from "@langchain/core/runnables";

// 模型运行时配置，包含解密后的凭证
export type RuntimeConfig = {
  model_name: string;
  base_url: string;
  api_key: string;
};

// 补全 base_url 协议：localhost 用 http，其余默认 https；移除末尾斜杠
export function normalizeBaseUrl(baseUrl?: string): string | undefined {
  if (!baseUrl) return undefined;
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) return undefined;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return /^(localhost|127\.0\.0\.1|\[?::1\]?)(?::\d+)?(?:\/|$)/i.test(trimmed)
    ? `http://${trimmed}`
    : `https://${trimmed}`;
}

// 从 runConfig.configurable 中读取前端选中的模型 ID，无配置时回退到默认值
export function resolveModelId(defaultModel: string, config?: RunnableConfig): string {
  const configurable =
    config?.configurable && typeof config.configurable === "object"
      ? (config.configurable as Record<string, unknown>)
      : {};
  const configuredModel = configurable.model;
  return typeof configuredModel === "string" && configuredModel.trim()
    ? configuredModel.trim()
    : defaultModel;
}

// 运行时配置获取器，带进程内缓存避免重复请求后端
export class RuntimeConfigClient {
  private cache = new Map<string, RuntimeConfig>();

  constructor(private backendApiUrl: string) {}

  async getRuntimeConfig(modelId: string, signal?: AbortSignal): Promise<RuntimeConfig> {
    // 缓存命中直接返回，同一会话多次调用只请求一次后端
    const cached = this.cache.get(modelId);
    if (cached) return cached;

    if (!modelId) {
      throw new Error("No model is selected. Add and select a model in model settings first.");
    }

    // 调用 API 获取解密后的运行时凭证（model_name, base_url, api_key）
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
