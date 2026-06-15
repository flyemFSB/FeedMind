import { Mastra } from "@mastra/core";
import { chatRoute } from "@mastra/ai-sdk";
import { LibSQLStore } from "@mastra/libsql";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { feedmindAgent } from "./agents/feedmind-agent.js";
import { ToolConfigClient } from "./tools/search/config.js";

/** Mastra 专属 storage 数据库路径（独立于业务库 feedmind.db） */
const thisDir = dirname(fileURLToPath(import.meta.url));
const mastraDbPath = resolve(thisDir, "..", "..", "..", "..", "data", "mastra.db");

/** 初始化工具配置客户端：使 search/fetch 工具能读取数据库中的 API key */
export function initToolConfig(): void {
  new ToolConfigClient();
}

/** 创建 Mastra 实例，注册 Agent 和 AI SDK Chat Route */
export function createMastra(): Mastra {
  return new Mastra({
    agents: { feedmindAgent },
    storage: new LibSQLStore({
      id: "feedmind-mastra",
      url: `file:${mastraDbPath.replace(/\\/g, "/")}`,
    }),
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
