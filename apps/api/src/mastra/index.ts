import { Mastra } from "@mastra/core";
import { chatRoute } from "@mastra/ai-sdk";
import { LibSQLStore } from "@mastra/libsql";
import { resolve } from "node:path";
import { feedmindAgent } from "./agents/feedmind-agent.js";
import { dailyReportWorkflow } from "./workflows/daily-report.js";
import { dailyReportRunWorkflow } from "./workflows/run-workflow.js";
import { getVectorStore } from "./vector-store.js";
import { ToolConfigClient } from "./tools/search/config.js";
import { resolveDataDir } from "../lib/data-dir.js";

const mastraDbPath = resolve(resolveDataDir(), "mastra.db");

export function initToolConfig(): void {
  new ToolConfigClient();
}

export function createMastra(): Mastra {
  return new Mastra({
    agents: { feedmind: feedmindAgent },
    workflows: { dailyReport: dailyReportWorkflow, dailyReportRun: dailyReportRunWorkflow },
    // 显式启用调度器：即使只用 imperative schedules（workflow 未声明 schedule 字段）也启动 SchedulerWorker
    scheduler: { enabled: true },
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
