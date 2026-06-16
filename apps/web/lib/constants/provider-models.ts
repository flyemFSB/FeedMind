export interface ProviderModelInfo {
  name: string;
  modelId: string;
  context: string;
  maxOutput: string;
}

export type ProviderModelsMap = Record<string, ProviderModelInfo[]>;

export const CUSTOM_PROVIDER = "自定义";

/** 将显示名转为 API 模型 ID："Claude Opus 4.8" → "claude-opus-4.8" */
export function displayNameToModelId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** 格式化 KB 数值为可读字符串：< 1000 加 "K"，≥ 1000 转 "M" */
export function formatKB(value: string | null | undefined): string {
  if (!value) return "";
  const num = parseFloat(value);
  if (Number.isNaN(num)) return value;
  if (num >= 1000) {
    const m = num / 1000;
    return m % 1 === 0 ? `${m}M` : `${m.toFixed(2).replace(/\.?0+$/, "")}M`;
  }
  return `${num}K`;
}

export const PROVIDER_MODELS: ProviderModelsMap = {
  ChatGPT: [
    { name: "GPT 5.5", modelId: "gpt-5.5", context: "1000", maxOutput: "64" },
    { name: "GPT 5.4", modelId: "gpt-5.4", context: "1000", maxOutput: "128" },
  ],
  Claude: [
    { name: "Claude Opus 4.8", modelId: "claude-opus-4.8", context: "1000", maxOutput: "128" },
    { name: "Claude Opus 4.7", modelId: "claude-opus-4.7", context: "1000", maxOutput: "128" },
    { name: "Claude Sonnet 4.6", modelId: "sonnet-4.6", context: "1000", maxOutput: "64" },
  ],
  DeepSeek: [
    { name: "DeepSeek V4 Pro", modelId: "deepseek-v4-pro", context: "1000", maxOutput: "384" },
    { name: "DeepSeek V4 Flash", modelId: "deepseek-v4-flash", context: "1000", maxOutput: "32" },
  ],
  Gemini: [
    { name: "Gemini 3.1 Pro", modelId: "gemini-3.1-pro", context: "1000", maxOutput: "64" },
    { name: "Gemini 3.1 Flash", modelId: "gemini-3.1-flash", context: "1000", maxOutput: "64" },
  ],
  GLM: [
    { name: "GLM 5.1", modelId: "glm-5.1", context: "200", maxOutput: "131" },
    { name: "GLM 5", modelId: "glm-5", context: "200", maxOutput: "32" },
  ],
  Kimi: [
    { name: "Kimi K2.6", modelId: "kimi-k2.6", context: "256", maxOutput: "长生成" },
    { name: "Kimi K2.5", modelId: "kimi-k2.5", context: "256", maxOutput: "长生成" },
  ],
  MiniMax: [
    { name: "MiniMax M3", modelId: "minimax-m3", context: "1050", maxOutput: "128" },
    { name: "MiniMax M2.7", modelId: "minimax-m2.7", context: "200", maxOutput: "131" },
  ],
  Qwen: [
    { name: "Qwen 3.7 Plus", modelId: "qwen-3.7-plus", context: "1000", maxOutput: "65" },
    { name: "Qwen 3.7 Max", modelId: "qwen-3.7-max", context: "1000", maxOutput: "65" },
  ],
};

export function getProviderBaseUrl(provider: string): string {
  const baseUrls: Record<string, string> = {
    ChatGPT: "https://api.openai.com/v1",
    Claude: "https://api.anthropic.com/v1",
    DeepSeek: "https://api.deepseek.com",
    Gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
    GLM: "https://open.bigmodel.cn/api/paas/v4",
    Kimi: "https://api.moonshot.cn/v1",
    MiniMax: "https://api.minimax.chat/v1",
    Qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  };
  return baseUrls[provider] ?? "";
}

export function lookupModelInfo(
  provider: string,
  modelName: string,
): ProviderModelInfo | undefined {
  return PROVIDER_MODELS[provider]?.find((m) => m.name === modelName);
}
