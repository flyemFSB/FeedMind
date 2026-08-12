import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import {
  dailyReportScriptSchema,
  extractFeedSchema,
  extractOutputSchema,
  type ExtractItem,
} from "@feedmind/contracts";
import { buildExtractItems } from "./extract.js";
import { buildScript } from "./script.js";
import { reviewAndFix } from "./review.js";

/**
 * 日报管线 workflow：fetch → extract → script → review → tts → render。
 * 抓取(syncAll)在服务层完成，feed 元数据经 input 传入，workflow 只做数据转换——
 * 便于测试（feed 为空即离线可跑）且与真实 I/O 解耦。
 * extract/script/review 步已接真实逻辑（LLM + 兜底），tts/render 步为路径占位
 * （真实合成/渲染由服务层在管线结束后执行）。
 */
const runInitSchema = z.object({
  runId: z.string(),
  scheduleId: z.string(),
  feeds: z.array(extractFeedSchema),
});

// 抓取已由服务层完成，此处校验并透传 feed 列表（管线的数据入口契约）
const fetchStep = createStep({
  id: "fetch-sources",
  inputSchema: runInitSchema,
  outputSchema: z.object({ feeds: z.array(extractFeedSchema) }),
  execute: async ({ inputData }) => {
    return { feeds: inputData.feeds };
  },
});

const extractStep = createStep({
  id: "extract",
  inputSchema: z.object({ feeds: z.array(extractFeedSchema) }),
  outputSchema: extractOutputSchema,
  execute: async ({ inputData }) => {
    const items = await buildExtractItems(inputData.feeds);
    return { items };
  },
});

const scriptStep = createStep({
  id: "script",
  inputSchema: extractOutputSchema,
  outputSchema: z.object({ script: dailyReportScriptSchema }),
  execute: async ({ inputData }) => {
    // 真实 script agent 生成分镜脚本（LLM 失败回退最小脚本）
    const script = await buildScript(inputData.items);
    return { script };
  },
});

const reviewStep = createStep({
  id: "review",
  inputSchema: z.object({ script: dailyReportScriptSchema }),
  outputSchema: z.object({ script: dailyReportScriptSchema }),
  execute: async ({ inputData, getStepResult }) => {
    // 真实审稿：以 extract 的要点为 ground truth 校验，不合格重写脚本，达上限抛错
    const { items } = getStepResult<{ items: ExtractItem[] }>("extract");
    const { script } = await reviewAndFix(inputData.script, items);
    return { script };
  },
});

const ttsStep = createStep({
  id: "tts",
  inputSchema: z.object({ script: dailyReportScriptSchema }),
  outputSchema: z.object({
    audioPath: z.string(),
    srtPath: z.string(),
    script: dailyReportScriptSchema,
  }),
  execute: async ({ inputData, getInitData }) => {
    // 替身：真实 TTS（Fish/edge-tts）由服务层在管线结束后合成；此处只定路径并透传最终脚本
    const { runId } = getInitData<{ runId: string }>();
    return {
      audioPath: `videos/${runId}/narration.mp3`,
      srtPath: `videos/${runId}/narration.srt`,
      script: inputData.script,
    };
  },
});

const renderStep = createStep({
  id: "render",
  inputSchema: z.object({
    audioPath: z.string(),
    srtPath: z.string(),
    script: dailyReportScriptSchema,
  }),
  outputSchema: z.object({
    videoPath: z.string(),
    duration: z.number(),
    script: dailyReportScriptSchema,
  }),
  execute: async ({ inputData, getInitData }) => {
    // 路径占位：真实 Remotion 渲染由服务层在管线结束后执行；此处透传最终脚本
    const { runId } = getInitData<{ runId: string }>();
    return {
      videoPath: `videos/${runId}/report.mp4`,
      duration: 0,
      script: inputData.script,
    };
  },
});

export const dailyReportWorkflow = createWorkflow({
  id: "daily-report",
  inputSchema: runInitSchema,
  outputSchema: z.object({
    videoPath: z.string(),
    duration: z.number(),
    script: dailyReportScriptSchema,
  }),
})
  .then(fetchStep)
  .then(extractStep)
  .then(scriptStep)
  .then(reviewStep)
  .then(ttsStep)
  .then(renderStep)
  .commit();

export type DailyReportRunInit = z.infer<typeof runInitSchema>;
