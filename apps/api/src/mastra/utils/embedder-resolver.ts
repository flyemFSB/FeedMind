import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { MastraEmbeddingModel } from "@mastra/core/vector";
import { getModelRuntime, getSelectedModel } from "../../modules/models/service.js";
import { createSanitizedFetch } from "../../modules/models/sanitized-fetch.js";
import { logger } from "../../lib/logger.js";
import { cachedGet } from "./cached-get.js";

type V4EmbeddingModel = ReturnType<ReturnType<typeof createOpenAICompatible>["textEmbeddingModel"]>;

/**
 * v4 → v3 适配：Mastra 1.55 的 vector/memory 层仅支持 specificationVersion ≤ v3 的
 * embedding 模型，而 @ai-sdk/openai-compatible 只产出 v4；两代 doEmbed 的运行时
 * 契约一致（values → embeddings/usage.tokens），薄包装透传即可。升级 Mastra 后
 * 若原生支持 v4，此适配可删除。
 */
function toV3Embedder(model: V4EmbeddingModel): MastraEmbeddingModel<string> {
  return {
    specificationVersion: "v3",
    provider: model.provider,
    modelId: model.modelId,
    maxEmbeddingsPerCall: model.maxEmbeddingsPerCall,
    supportsParallelCalls: model.supportsParallelCalls,
    doEmbed: (options: Parameters<V4EmbeddingModel["doEmbed"]>[0]) =>
      model.doEmbed(options) as never,
  } as unknown as MastraEmbeddingModel<string>;
}

/**
 * 解析用户配置的 embedding 模型（模型表 type="embedding" 的已选项）。
 *
 * 返回 OpenAI 兼容的 textEmbeddingModel 实例；未配置时返回 null——
 * OM 的 retrieval.vector 自动降级为纯分页 recall，不阻塞聊天主链路。
 * 已选项与运行时配置均走 cachedGet 30s TTL，配置变更后最多 30s 生效（本地应用可接受）。
 */
export async function resolveEmbeddingModel(): Promise<MastraEmbeddingModel<string> | null> {
  try {
    const selected = await cachedGet("getSelectedEmbeddingModel", () =>
      getSelectedModel("embedding"),
    );
    // 解构后再判空：闭包内对象属性的类型收窄不保留，直接传 selected.id 会报 null 错
    const selectedId = selected.id;
    if (!selectedId) return null;
    const config = await cachedGet(`getModelRuntime:${selectedId}`, () =>
      getModelRuntime(selectedId),
    );
    const provider = createOpenAICompatible({
      name: "feedmind-embedding",
      apiKey: config.api_key,
      baseURL: config.base_url ?? "",
      fetch: createSanitizedFetch(config.base_url ?? undefined),
    });
    return toV3Embedder(provider.textEmbeddingModel(config.model_id?.trim() ?? ""));
  } catch (err) {
    // embedding 是可选增强：解析失败降级为纯分页 recall，不能让聊天主链路崩掉
    logger.warn({ err }, "解析 embedding 模型失败，OM 语义检索降级为纯分页 recall");
    return null;
  }
}
