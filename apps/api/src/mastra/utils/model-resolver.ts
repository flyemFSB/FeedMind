import { resolveModelClient } from "../agents/model-cache.js";
import { getSelectedModel } from "../../modules/models/service.js";
import { cachedGet } from "./cached-get.js";
import type { createOpenAICompatible } from "@ai-sdk/openai-compatible";

type ChatModel = ReturnType<ReturnType<typeof createOpenAICompatible>["chatModel"]>;

/**
 * 共享模型解析 — 供 feedmind-agent 和 task tool 统一使用。
 *
 * 解析链路：
 * 1. 优先使用请求级模型 ID（来自 header → requestContext）
 * 2. 回退：查询已选模型（带 30s TTL 缓存）
 */
export async function resolveChatModel(requestContext?: {
  get(key: string): unknown;
}): Promise<ChatModel> {
  const modelId = requestContext?.get("feedmindModelId") as string | undefined;
  if (modelId) {
    try {
      const { client, modelName } = await resolveModelClient(Number(modelId));
      return client.chatModel(modelName);
    } catch {
      // 请求级模型解析失败，回退到已选模型
    }
  }

  const selected = await cachedGet("getSelectedModel", () => getSelectedModel());
  if (!selected.id) {
    throw new Error("未配置模型。请在设置中添加一个 LLM 模型后再试。");
  }

  const { client, modelName } = await resolveModelClient(selected.id);
  return client.chatModel(modelName);
}
