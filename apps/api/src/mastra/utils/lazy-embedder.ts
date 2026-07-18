import { resolveEmbeddingModel } from "./embedding-resolver.js";
import { logger } from "../../lib/logger.js";

let resolved: unknown = undefined;

async function getEmbedder() {
  if (resolved === undefined) {
    try {
      resolved = await resolveEmbeddingModel();
    } catch (err) {
      logger.warn({ err }, "解析嵌入模型失败，向量检索将不可用");
      resolved = null;
    }
  }
  if (!resolved) {
    throw new Error("未配置嵌入模型。请在设置 → 模型配置中添加嵌入模型。");
  }
  return resolved as { doEmbed: Function };
}

export const lazyEmbedder = {
  specificationVersion: "v3" as const,
  provider: "feedmind",
  modelId: "lazy-embedder",
  maxEmbeddingsPerCall: 256,

  async doEmbed(options: { values: string[]; abortSignal?: AbortSignal }) {
    const embedder = await getEmbedder();
    return embedder.doEmbed(options);
  },
};
