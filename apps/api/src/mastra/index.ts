import { Mastra } from "@mastra/core";
import { chatRoute } from "@mastra/ai-sdk";
import { feedmindAgent } from "./agents/feedmind-agent.js";
import { ToolConfigClient } from "./tools/search/config.js";

/** 初始化工具配置客户端：使 search/fetch 工具能读取数据库中的 API key */
export function initToolConfig(backendApiUrl: string): void {
  new ToolConfigClient(backendApiUrl);
}

/** 创建 Mastra 实例，注册 Agent 和 AI SDK Chat Route */
export function createMastra(): Mastra {
  return new Mastra({
    agents: { feedmindAgent },
    server: {
      apiRoutes: [
        chatRoute({
          path: "/v1/agent/chat/:agentId",
          sendReasoning: true,
          version: "v6",
        }),
      ],
    },
  });
}
