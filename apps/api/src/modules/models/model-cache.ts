import { createAnthropic } from "@ai-sdk/anthropic";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createGoogle } from "@ai-sdk/google";
import { createMiniMax } from "@ai-sdk/minimax";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { EmbeddingModel, LanguageModel } from "ai";
import { getModelRuntime } from "../../modules/models/service.js";
import { createSanitizedFetch } from "./sanitized-fetch.js";

/** v4 聊天模型：Mastra Agent.model 与 generateText 均按 v4 契约校验，
 * 联合类型会因含 V2/V3/全局模型 ID 分支而无法赋值，故收窄到 v4 */
export type ChatModel = Extract<LanguageModel, { specificationVersion: "v4" }>;

/** v4 嵌入模型（ai 联合类型按 specificationVersion 收窄，两代 doEmbed 契约一致） */
export type V4EmbeddingModel = Extract<EmbeddingModel, { specificationVersion: "v4" }>;

/** 模型客户端统一接口：chat 必选；embedding 视 provider 能力而定 */
export interface ResolvedModelClient {
  chatModel(modelId: string): ChatModel;
  textEmbeddingModel?(modelId: string): V4EmbeddingModel;
}

export interface ResolvedModel {
  client: ResolvedModelClient;
  modelName: string;
  contextWindow: number | null;
  maxOutput: number | null;
}

/**
 * 内置 provider 走各自官方 SDK（原生协议，base_url 留空即官方默认端点）；
 * provider 名取 web 端模型表单的显示名（model 表存的就是展示名）。
 * 未收录的 provider（GLM/Kimi/Qwen/免费模型端点等）回退 OpenAI 兼容客户端。
 */
const BUILTIN_FACTORIES: Record<
  string,
  (settings: { apiKey?: string; baseURL?: string }) => unknown
> = {
  ChatGPT: createOpenAI,
  Claude: createAnthropic,
  DeepSeek: createDeepSeek,
  Gemini: createGoogle,
  MiniMax: createMiniMax,
};

// 内置且提供文本嵌入的 provider：anthropic 无 embedding 产品（textEmbeddingModel 类型为 never），
// deepseek/minimax 的 SDK 同样未实现——按白名单暴露，避免把 never 型方法漏给调用方
const BUILTIN_EMBEDDING_PROVIDERS = new Set(["ChatGPT", "Gemini"]);

interface BuiltinClientLike {
  languageModel(modelId: string): ChatModel;
  textEmbeddingModel?(modelId: string): V4EmbeddingModel;
}

const modelClientCache = new Map<number, ResolvedModel>();

export function clearModelClientCache(): void {
  modelClientCache.clear();
}

export async function resolveModelClient(modelId: number): Promise<ResolvedModel> {
  const cached = modelClientCache.get(modelId);
  if (cached) return cached;

  const config = await getModelRuntime(modelId);
  // exactOptionalPropertyTypes 下条件展开构造，避免显式 undefined 进 optional 字段
  const settings: { apiKey?: string; baseURL?: string } = {};
  if (config.api_key) settings.apiKey = config.api_key;
  if (config.base_url) settings.baseURL = config.base_url;
  const factory = BUILTIN_FACTORIES[config.provider];

  let client: ResolvedModelClient;
  if (factory) {
    const provider = factory(settings) as BuiltinClientLike;
    client = {
      chatModel: (id) => provider.languageModel(id),
      ...(BUILTIN_EMBEDDING_PROVIDERS.has(config.provider)
        ? { textEmbeddingModel: (id) => provider.textEmbeddingModel!(id) }
        : {}),
    };
  } else {
    // 兼容路径：OpenAI 兼容协议 + sanitized fetch（修流式 tool_calls 脏字段、429 退避）
    const compatible = createOpenAICompatible({
      name: "feedmind",
      apiKey: config.api_key,
      baseURL: config.base_url || "",
      fetch: createSanitizedFetch(config.base_url || undefined),
    });
    client = {
      chatModel: (id) => compatible.chatModel(id),
      textEmbeddingModel: (id) => compatible.textEmbeddingModel(id),
    };
  }

  const entry: ResolvedModel = {
    client,
    modelName: config.model_name,
    contextWindow: config.context_window,
    maxOutput: config.max_output,
  };
  modelClientCache.set(modelId, entry);
  return entry;
}
