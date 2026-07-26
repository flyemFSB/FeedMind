import { resolveEmbeddingModel } from "./embedding-resolver.js";
import { logger } from "../../lib/logger.js";

type Embedder = {
  doEmbed: (options: { values: string[]; abortSignal?: AbortSignal }) => Promise<unknown>;
};

function isEmbedder(value: unknown): value is Embedder {
  return (
    typeof value === "object" &&
    value !== null &&
    "doEmbed" in value &&
    typeof value.doEmbed === "function"
  );
}

let resolved: Embedder | null | undefined = undefined;

async function getEmbedder(): Promise<Embedder> {
  if (resolved === undefined) {
    try {
      const candidate = await resolveEmbeddingModel();
      resolved = isEmbedder(candidate) ? candidate : null;
    } catch (err) {
      logger.warn({ err }, "解析嵌入模型失败，向量检索将不可用");
      resolved = null;
    }
  }
  if (!resolved) {
    throw new Error("未配置嵌入模型。请在设置 → 模型配置中添加嵌入模型。");
  }
  return resolved;
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
