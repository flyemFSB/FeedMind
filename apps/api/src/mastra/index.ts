import { Mastra } from "@mastra/core";
import { chatRoute } from "@mastra/ai-sdk";
import { LibSQLStore } from "@mastra/libsql";
import { resolve } from "node:path";
import { feedmindAgent } from "./agents/feedmind-agent.js";
import { dailyReportWorkflow } from "./workflows/daily-report/index.js";
import { dailyReportRunWorkflow } from "./workflows/run-workflow.js";
import { ToolConfigClient } from "./tools/search/config.js";
import { resolveDataDir } from "../lib/data-dir.js";

export function initToolConfig(): void {
  new ToolConfigClient();
}

export function createMastra(): Mastra {
  const mastraDbPath = resolve(resolveDataDir(), "mastra.db");
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
          // 与前端 AI SDK v7（ai@7 + @ai-sdk/react@4）原生对齐
          version: "v7",
        }),
      ],
    },
  });
}

/**
 * 等待 Observational Memory 后台观察/反射周期写库完成。
 * Electron 退出前调用，避免 OM 后台写 mastra.db 被截断。永不 reject，超时放行不阻塞退出。
 */
export async function waitForMemorySettled(timeoutMs = 5_000): Promise<void> {
  try {
    const memory = await feedmindAgent.getMemory();
    await Promise.race([
      memory?.settled(),
      new Promise<void>((resolveSleep) => setTimeout(resolveSleep, timeoutMs)),
    ]);
  } catch {
    // memory 不可用等场景直接放行，退出流程不因清理失败而阻塞
  }
}
