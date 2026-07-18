import { Mastra } from "@mastra/core";
import { chatRoute } from "@mastra/ai-sdk";
import { LibSQLStore } from "@mastra/libsql";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { feedmindAgent } from "./agents/feedmind-agent.js";
import { getVectorStore } from "./vector-store.js";
import { ToolConfigClient } from "./tools/search/config.js";

const thisDir = dirname(fileURLToPath(import.meta.url));
const mastraDbPath = resolve(thisDir, "..", "..", "..", "..", "data", "mastra.db");

export function initToolConfig(): void {
  new ToolConfigClient();
}

export function createMastra(): Mastra {
  return new Mastra({
    agents: { feedmind: feedmindAgent },
    storage: new LibSQLStore({
      id: "feedmind-mastra",
      url: `file:${mastraDbPath.replace(/\\/g, "/")}`,
    }),
    vectors: { libsql: getVectorStore() },
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
