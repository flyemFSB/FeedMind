import { Agent } from "@mastra/core/agent";
import type { RequestContext } from "@mastra/core/request-context";
import { buildSystemPrompt } from "../prompts/system.js";
import { resolveModelClient } from "./model-cache.js";
import { askClarificationTool } from "../tools/ask-clarification.js";
import { webFetchTool } from "../tools/web-fetch.js";
import { webSearchTool } from "../tools/web-search.js";
import { wikiReadTool } from "../tools/wiki-read.js";
import { wikiSearchTool } from "../tools/wiki-search.js";

/**
 * FeedMind Agent — 通过 Mastra RequestContext 动态解析模型。
 *
 * 模型解析流程：
 * 1. 前端发送 POST 请求，body 中包含 requestContext.feedmindModelId
 * 2. MastraServer 的 context middleware 从 body 读取 requestContext → 注入 RequestContext
 * 3. Agent 的 model 函数读取 feedmindModelId，从缓存或 DB 获取模型配置，创建 AI SDK 模型实例
 */
export const feedmindAgent = new Agent({
  id: "feedmind",
  name: "FeedMind",
  instructions: buildSystemPrompt(),
  model: async ({ requestContext }: { requestContext?: RequestContext }) => {
    const modelId = requestContext?.get("feedmindModelId") as string | undefined;
    if (!modelId) return `openai/gpt-4o-mini`;

    try {
      const { client, modelName } = await resolveModelClient(Number(modelId));
      return client.chat(modelName);
    } catch {
      return `openai/gpt-4o-mini`;
    }
  },
  tools: {
    askClarificationTool,
    webFetchTool,
    webSearchTool,
    wikiReadTool,
    wikiSearchTool,
  },
});
