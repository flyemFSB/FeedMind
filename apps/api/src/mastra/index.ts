import { Mastra } from "@mastra/core";
import { chatRoute } from "@mastra/ai-sdk";
import { LibSQLStore } from "@mastra/libsql";
import { resolve } from "node:path";
import { feedmindAgent } from "./agents/feedmind-agent.js";
import { dailyReportWorkflow } from "./workflows/daily-report/index.js";
import { dailyReportRunWorkflow } from "./workflows/run-workflow.js";
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
    // 显式启用调度器：即使只用 imperative schedules（workflow 未声明 schedule 字段）也启动 SchedulerWorker。
    // tickIntervalMs 从默认 10s 放宽到 60s：本地应用只有 daily-report 类分钟级精度的 cron，
    // 10s 轮询纯属浪费（每次 tick 查一次 schedules 表）。
    scheduler: { enabled: true, tickIntervalMs: 60_000 },
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
