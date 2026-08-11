import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { triggerReport } from "../../modules/daily-report/service.js";

/**
 * 定时触发的薄壳 workflow：Mastra schedules 按 cron 触发它，单步调用服务层完整管线
 * （syncAll → LLM 提炼/脚本/审稿 → TTS → 渲染），管线内部自行建 video 记录并后台执行。
 * 与手动触发（POST /daily-report/trigger）共用 triggerReport 入口。
 */
const runStep = createStep({
  id: "run",
  inputSchema: z.object({ scheduleId: z.string() }),
  outputSchema: z.object({ videoId: z.string() }),
  execute: async ({ inputData }) => {
    const video = await triggerReport(inputData.scheduleId);
    return { videoId: video.id };
  },
});

export const dailyReportRunWorkflow = createWorkflow({
  id: "daily-report-run",
  inputSchema: z.object({ scheduleId: z.string() }),
  outputSchema: z.object({ videoId: z.string() }),
})
  .then(runStep)
  .commit();
