import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { MastraEmbeddingModel } from "@mastra/core/vector";
import { resolveModelClient, type V4EmbeddingModel } from "../../modules/models/model-cache.js";
import { getModelRuntime, getSelectedModel } from "../../modules/models/service.js";
import { createSanitizedFetch } from "../../modules/models/sanitized-fetch.js";
import { logger } from "../../lib/logger.js";

/**
 * v4 → v3 适配：Mastra 1.55 的 vector/memory 层仅支持 specificationVersion "v3" 的
 * embedding 模型，而 AI SDK v7 的 provider 只产 v4；两者 doEmbed 的运行时
 * 契约一致（values / embeddings / usage.tokens），薄包装透传即可。升级 Mastra 后
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
 * 内置 provider（ChatGPT/Gemini）走官方 SDK 的嵌入模型；其余（Claude/DeepSeek
 * 无 embedding 产品，或自定义端点如硅基流动 bge-m3）回退 OpenAI 兼容客户端。
 * 未配置时返回 null——OM 的 retrieval.vector 自动降级为纯分页 recall，不阻塞聊天主链路。
 * 不缓存：本地 SQLite 单行读（~0.2ms），加缓存反而要额外维护失效信号。
 */
export async function resolveEmbeddingModel(): Promise<MastraEmbeddingModel<string> | null> {
  try {
    const selected = await getSelectedModel("embedding");
    // 解构后再判空：闭包内对象属性的类型收窄不保留，直接用 selected.id 会报 null 比较
    const selectedId = selected.id;
    if (!selectedId) return null;
    const [resolved, runtime] = await Promise.all([
      resolveModelClient(selectedId),
      getModelRuntime(selectedId),
    ]);
    // 复用模型客户端缓存的实例，避免同模型两套连接；API 调用名取 runtime 的 model_id
    const modelId = runtime.model_id ?? "";
    let v4Model: V4EmbeddingModel;
    if (resolved.client.textEmbeddingModel) {
      v4Model = resolved.client.textEmbeddingModel(modelId);
    } else {
      const provider = createOpenAICompatible({
        name: "feedmind-embedding",
        apiKey: runtime.api_key,
        baseURL: runtime.base_url ?? "",
        fetch: createSanitizedFetch(),
      });
      v4Model = provider.textEmbeddingModel(modelId);
    }
    return toV3Embedder(v4Model);
  } catch (err) {
    // 向量嵌入是可选增强项：解析失败降级为纯分页检索召回，保证聊天主流程正常可用
    logger.warn({ err }, "解析向量嵌入模型失败，观察记忆（OM）语义检索降级为分页召回");
    return null;
  }
}
