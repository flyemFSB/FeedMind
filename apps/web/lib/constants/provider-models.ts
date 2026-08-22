export interface ProviderModelInfo {
  name: string;
  modelId: string;
  context: string;
  maxOutput: string;
}

export type ProviderModelsMap = Record<string, ProviderModelInfo[]>;

export const CUSTOM_PROVIDER = "自定义";

const KNOWN_WORDS_MAP: Record<string, string> = {
  gpt: "GPT",
  deepseek: "DeepSeek",
  claude: "Claude",
  gemini: "Gemini",
  glm: "GLM",
  chatglm: "ChatGLM",
  kimi: "Kimi",
  minimax: "MiniMax",
  qwen: "Qwen",
  llama: "Llama",
  mistral: "Mistral",
  mixtral: "Mixtral",
  baichuan: "Baichuan",
  yi: "Yi",
  internlm: "InternLM",
  phi: "Phi",
  moonshot: "Moonshot",
  ernie: "ERNIE",
  spark: "Spark",
  doubao: "Doubao",
  hunyuan: "Hunyuan",
  step: "Step",
  gemma: "Gemma",
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  meta: "Meta",
  alibaba: "Alibaba",
  codestral: "Codestral",
  starcoder: "StarCoder",
  tts: "TTS",
  asr: "ASR",
  ocr: "OCR",
  vl: "VL",
  it: "IT",
  api: "API",
  pro: "Pro",
  flash: "Flash",
  plus: "Plus",
  max: "Max",
  mini: "Mini",
  turbo: "Turbo",
  instruct: "Instruct",
  chat: "Chat",
  coder: "Coder",
  coding: "Coding",
  reasoner: "Reasoner",
  reasoning: "Reasoning",
  vision: "Vision",
  lite: "Lite",
  preview: "Preview",
  latest: "Latest",
  base: "Base",
  exp: "Exp",
  thinking: "Thinking",
  search: "Search",
  math: "Math",
  code: "Code",
  fast: "Fast",
  nano: "Nano",
  small: "Small",
  medium: "Medium",
  large: "Large",
  ultra: "Ultra",
  embed: "Embed",
  embedding: "Embedding",
};

/** 查找是否匹配预置模型的 modelId */
export function lookupModelByModelId(modelId: string): ProviderModelInfo | undefined {
  const normalized = modelId.trim().toLowerCase();
  for (const models of Object.values(PROVIDER_MODELS)) {
    const found = models.find((m) => m.modelId.toLowerCase() === normalized);
    if (found) return found;
  }
  return undefined;
}

/**
 * 将模型调用名称自动格式化为美化的显示名称
 * 例："deepseek-v4-flash" → "DeepSeek V4 Flash"
 *     "gpt-4o-mini" → "GPT 4o Mini"
 *     "claude-3-5-sonnet" → "Claude 3.5 Sonnet"
 */
export function formatModelDisplayName(rawModelId: string): string {
  const trimmed = rawModelId.trim();
  if (!trimmed) return "";

  // 1. 如果在预置模型中存在精确匹配，直接返回官方定义的名字
  const matched = lookupModelByModelId(trimmed);
  if (matched) return matched.name;

  // 2. 如果包含斜杠路径（如 "deepseek-ai/DeepSeek-V3"），取模型名主体
  let mainPart = trimmed.includes("/") ? (trimmed.split("/").pop() ?? trimmed) : trimmed;

  // 3. 将数字之间的版本连字符（如 3-5 -> 3.5, 2-5 -> 2.5, 1-5 -> 1.5）标准化为点号
  mainPart = mainPart.replace(/\b(\d+)-(\d+)\b/g, "$1.$2");

  // 4. 将常见分隔符（-、_、:）拆分为单词
  const tokens = mainPart.split(/[-_:]+/).filter(Boolean);
  if (tokens.length === 0) return trimmed;

  const formattedTokens = tokens.map((token) => {
    const lower = token.toLowerCase();

    // 字典精确匹配
    if (KNOWN_WORDS_MAP[lower]) {
      return KNOWN_WORDS_MAP[lower];
    }

    // 版本号：v1, v4, v3.5, v1.5 等 → V1, V4, V3.5
    if (/^v\d+(\.\d+)*$/i.test(token)) {
      return "V" + token.slice(1);
    }

    // 代号：r1, r2 等 → R1, R2
    if (/^r\d+$/i.test(token)) {
      return "R" + token.slice(1);
    }

    // 参数量：70b, 7b, 32b, 1.5b 等 → 70B, 7B, 32B, 1.5B
    if (/^\d+(\.\d+)?b$/i.test(token)) {
      return token.slice(0, -1) + "B";
    }

    // 如果已经是 CamelCase / PascalCase 且不是全小写，保留原本大小写
    if (token !== token.toLowerCase() && token !== token.toUpperCase()) {
      return token;
    }

    // 默认首字母大写
    return token.charAt(0).toUpperCase() + token.slice(1);
  });

  return formattedTokens.join(" ");
}

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
    { name: "DeepSeek V4 Flash", modelId: "deepseek-v4-flash", context: "1000", maxOutput: "384" },
  ],
  Gemini: [
    { name: "Gemini 3.1 Pro", modelId: "gemini-3.1-pro", context: "1000", maxOutput: "64" },
    { name: "Gemini 3.1 Flash", modelId: "gemini-3.1-flash", context: "1000", maxOutput: "64" },
  ],
  GLM: [
    { name: "GLM 5.1", modelId: "glm-5.1", context: "200", maxOutput: "128" },
    { name: "GLM 5", modelId: "glm-5", context: "200", maxOutput: "32" },
  ],
  Kimi: [
    { name: "Kimi K2.6", modelId: "kimi-k2.6", context: "256", maxOutput: "32" },
    { name: "Kimi K2.5", modelId: "kimi-k2.5", context: "256", maxOutput: "32" },
  ],
  MiniMax: [
    { name: "MiniMax M3", modelId: "minimax-m3", context: "1050", maxOutput: "128" },
    { name: "MiniMax M2.7", modelId: "minimax-m2.7", context: "200", maxOutput: "128" },
  ],
  Qwen: [
    { name: "Qwen 3.7 Plus", modelId: "qwen-3.7-plus", context: "1000", maxOutput: "64" },
    { name: "Qwen 3.7 Max", modelId: "qwen-3.7-max", context: "1000", maxOutput: "64" },
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
