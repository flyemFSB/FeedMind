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

/**
 * 将模型调用名称自动格式化为美化的显示名称
 * 例："deepseek-v4-flash" → "DeepSeek V4 Flash"
 *     "gpt-4o-mini" → "GPT 4o Mini"
 *     "claude-3-5-sonnet" → "Claude 3.5 Sonnet"
 */
export function formatModelDisplayName(rawModelId: string): string {
  const trimmed = rawModelId.trim();
  if (!trimmed) return "";

  // 1. 如果包含斜杠路径（如 "deepseek-ai/DeepSeek-V3"），取模型名主体
  let mainPart = trimmed.includes("/") ? (trimmed.split("/").pop() ?? trimmed) : trimmed;

  // 2. 将数字之间的版本连字符（如 3-5 -> 3.5, 2-5 -> 2.5, 1-5 -> 1.5）标准化为点号
  mainPart = mainPart.replace(/\b(\d+)-(\d+)\b/g, "$1.$2");

  // 3. 将常见分隔符（-、_、:）拆分为单词
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

/** 格式化 Token 数量（按 1000 进制换算为 K / M） */
export function formatTokenLimit(value: string | number | null | undefined): string {
  if (value == null || value === "") return "";
  let n = typeof value === "number" ? value : parseFloat(value);
  if (Number.isNaN(n) || n <= 0) return String(value);
  if (n >= 100_000) n = Math.round(n / 1000);
  return n >= 1000 ? `${parseFloat((n / 1000).toFixed(1))}M` : `${Math.round(n)}K`;
}

export const formatKB = formatTokenLimit;
