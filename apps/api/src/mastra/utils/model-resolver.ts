import { resolveModelClient } from "../../modules/models/model-cache.js";
import { getSelectedModel } from "../../modules/models/service.js";
import type { ChatModel, ResolvedModel } from "../../modules/models/model-cache.js";

/**
 * 共享模型解析 — 供 feedmind-agent 和 task tool 统一使用。
 *
 * 解析链路：
 * 1. 优先使用请求级模型 ID（来自 header → requestContext）
 * 2. 回退：查询已选模型（本地 SQLite 单行读，~0.1ms，不值得加缓存/失效机制）
 */
export async function resolveChatModelEntry(requestContext?: {
  get(key: string): unknown;
}): Promise<ResolvedModel> {
  const modelId = requestContext?.get("feedmindModelId") as string | undefined;
  if (modelId) {
    try {
      return await resolveModelClient(Number(modelId));
    } catch {
      // 请求级模型解析失败，回退到已选模型
    }
  }

  const selected = await getSelectedModel();
  if (!selected.id) {
    throw new Error("未配置模型。请在设置中添加一个 LLM 模型后再试。");
  }

  return resolveModelClient(selected.id);
}

/** 仅需模型实例时用这个；需要模型元信息（如是否默认开启思考）时用 resolveChatModelEntry */
export async function resolveChatModel(requestContext?: {
  get(key: string): unknown;
}): Promise<ChatModel> {
  const { client, modelApiId } = await resolveChatModelEntry(requestContext);
  return client.chatModel(modelApiId);
}
