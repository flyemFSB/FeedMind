import { describe, expect, it } from "vitest";
import { dailyReportWorkflow } from "./daily-report/index.js";

const RUN_INIT = { runId: "test-run", scheduleId: "daily-video", feeds: [] };

describe("dailyReportWorkflow 编排", () => {
  it("按序执行七步并产出占位视频路径", async () => {
    const run = await dailyReportWorkflow.createRun();
    const result = await run.start({ inputData: RUN_INIT });

    expect(result.status).toBe("success");
    if (result.status !== "success") throw new Error("workflow 运行失败");

    expect(result.stepExecutionPath).toEqual([
      "fetch-sources",
      "select-feeds",
      "extract",
      "script",
      "review",
      "tts",
      "render",
    ]);
    expect(result.result.videoPath).toContain("test-run");
    expect(result.result.duration).toBe(0);
  });

  it("脚本输出为合法契约（含开场钩子与收尾）", async () => {
    const run = await dailyReportWorkflow.createRun();
    const result = await run.start({ inputData: RUN_INIT });
    if (result.status !== "success") throw new Error("workflow 运行失败");

    const script = (result.steps as Record<string, { output?: { script?: unknown } }>)["script"]
      ?.output?.script as
      { opening: { hook: string }; closing: { summary: string }; items: unknown[] } | undefined;
    expect(script?.opening?.hook).toBeTruthy();
    expect(script?.closing?.summary).toBeTruthy();
    expect(Array.isArray(script?.items)).toBe(true);
  });
});
