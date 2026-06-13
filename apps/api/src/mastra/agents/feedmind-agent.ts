import { Agent } from "@mastra/core/agent";
import type { RequestContext } from "@mastra/core/request-context";
import { buildSystemPrompt } from "../prompts/system.js";
import { resolveModelClient } from "./model-cache.js";
import { getSelectedModel } from "../../modules/llms/service.js";
import { askClarificationTool } from "../tools/ask-clarification.js";
import { webFetchTool } from "../tools/web-fetch.js";
import { webSearchTool } from "../tools/web-search.js";
import { wikiReadTool } from "../tools/wiki-read.js";
import { wikiSearchTool } from "../tools/wiki-search.js";

/**
 * FeedMind Agent — 通过 Mastra RequestContext 动态解析模型。
 *
 * 模型解析流程：
 * 1. 前端发送 POST 请求（通过自定义 header 传递模型 ID）
 * 2. server.ts 中间件读取 x-feedmind-model-id header → 注入 RequestContext
 * 3. Agent 的 model 函数读取 feedmindModelId，从缓存或 DB 获取模型配置，创建 AI SDK 模型实例
 * 4. 无请求级模型 ID 时，回退到已选模型
 */
export const feedmindAgent = new Agent({
  id: "feedmind",
  name: "FeedMind",
  instructions: buildSystemPrompt(),
  model: async ({ requestContext }: { requestContext?: RequestContext }) => {
    // 1. 优先使用请求级模型 ID（来自 header → requestContext）
    const modelId = requestContext?.get("feedmindModelId") as string | undefined;
    if (modelId) {
      try {
        const { client, modelName } = await resolveModelClient(Number(modelId));
        return client.chat(modelName);
      } catch {
        // fall through to fallback
      }
    }

    // 2. 回退：查询已选模型
    const selected = await getSelectedModel();
    if (!selected.id) {
      throw new Error(
        "No model configured. Please add an LLM model in Settings, then try again.",
      );
    }

    const { client, modelName } = await resolveModelClient(selected.id);
    return client.chat(modelName);
  },
  tools: {
    askClarificationTool,
    webFetchTool,
    webSearchTool,
    wikiReadTool,
    wikiSearchTool,
  },
});
