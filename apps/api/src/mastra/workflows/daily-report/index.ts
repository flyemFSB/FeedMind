import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import {
  dailyReportScriptSchema,
  extractFeedSchema,
  extractOutputSchema,
  type ExtractItem,
} from "@feedmind/contracts";
import { selectFeeds, type SelectDeps } from "./select.js";
import { buildExtractItems, type ExtractDeps } from "./extract.js";
import { buildScript, type ScriptDeps } from "./script.js";
import { reviewAndFix, type ReviewDeps } from "./review.js";

/** step 级依赖注入：默认走真实 agent，测试注入假实现以获得确定性与离线能力 */
export interface DailyReportDeps {
  select?: SelectDeps;
  extract?: ExtractDeps;
  script?: ScriptDeps;
  review?: ReviewDeps;
}

/**
 * 日报内容加工 workflow：fetch-sources → select-feeds → extract → script → review。
 * 抓取(syncAll)、配音、渲染都在服务层：抓取是数据入口，配音/渲染是本地副作用（ffmpeg/Remotion），
 * workflow 只负责把题材变成合格脚本这一串数据转换。
 */
const runInitSchema = z.object({
  runId: z.string(),
  scheduleId: z.string(),
  feeds: z.array(extractFeedSchema),
});

export function createDailyReportWorkflow(deps: DailyReportDeps = {}) {
  // 抓取已由服务层完成，此处校验并透传 feed 列表（管线的数据入口契约）
  const fetchStep = createStep({
    id: "fetch-sources",
    inputSchema: runInitSchema,
    outputSchema: z.object({ feeds: z.array(extractFeedSchema) }),
    execute: async ({ inputData }) => {
      return { feeds: inputData.feeds };
    },
  });

  // 选题筛选：从待选 feed 中精选 5-8 条高价值资讯（深度来自少而精）
  const selectStep = createStep({
    id: "select-feeds",
    inputSchema: z.object({ feeds: z.array(extractFeedSchema) }),
    outputSchema: z.object({ feeds: z.array(extractFeedSchema) }),
    execute: async ({ inputData }) => {
      const selected = await selectFeeds(inputData.feeds, deps.select);
      return { feeds: selected };
    },
  });

  const extractStep = createStep({
    id: "extract",
    inputSchema: z.object({ feeds: z.array(extractFeedSchema) }),
    outputSchema: extractOutputSchema,
    execute: async ({ inputData }) => {
      const items = await buildExtractItems(inputData.feeds, deps.extract);
      return { items };
    },
  });

  const scriptStep = createStep({
    id: "script",
    inputSchema: extractOutputSchema,
    outputSchema: z.object({ script: dailyReportScriptSchema }),
    execute: async ({ inputData }) => {
      // 真实 script agent 生成分镜脚本（LLM 失败回退最小脚本）
      const script = await buildScript(inputData.items, deps.script);
      return { script };
    },
  });

  const reviewStep = createStep({
    id: "review",
    inputSchema: z.object({ script: dailyReportScriptSchema }),
    outputSchema: z.object({ script: dailyReportScriptSchema }),
    execute: async ({ inputData, getStepResult }) => {
      // 真实审稿：以 extract 的要点证据为 ground truth 校验，不合格回灌重写脚本，达上限抛错
      const { items } = getStepResult<{ items: ExtractItem[] }>("extract");
      const { script } = await reviewAndFix(inputData.script, items, deps.review);
      return { script };
    },
  });

  return createWorkflow({
    id: "daily-report",
    inputSchema: runInitSchema,
    outputSchema: z.object({ script: dailyReportScriptSchema }),
  })
    .then(fetchStep)
    .then(selectStep)
    .then(extractStep)
    .then(scriptStep)
    .then(reviewStep)
    .commit();
}

export const dailyReportWorkflow = createDailyReportWorkflow();

export type DailyReportRunInit = z.infer<typeof runInitSchema>;
