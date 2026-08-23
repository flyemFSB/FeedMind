import type { DailyReportScript, ExtractItem } from "@feedmind/contracts";
import { z } from "zod";
import { logger } from "../../../lib/logger.js";
import { reviewAgent } from "../../agents/review-agent.js";
import { buildScript } from "./script.js";

// 审稿总尝试次数（含首次评估与重写）：初始 1 次 + 重试上限 2 次
const MAX_ATTEMPTS = 3;

const reviewResultSchema = z.object({
  verdict: z.enum(["pass", "fail"]),
  issues: z.array(z.string()),
});

export type ReviewResult = z.infer<typeof reviewResultSchema>;

export interface ReviewDeps {
  /** LLM 审稿；默认走 reviewAgent（structuredOutput 直接产出判定对象） */
  evaluate?: (script: DailyReportScript, items: ExtractItem[]) => Promise<ReviewResult>;
  /** 重写脚本：默认走 buildScript（script agent） */
  rewrite?: (items: ExtractItem[]) => Promise<DailyReportScript>;
}

async function defaultEvaluate(
  script: DailyReportScript,
  items: ExtractItem[],
): Promise<ReviewResult> {
  const result = await reviewAgent.generate(
    `分镜脚本：\n${JSON.stringify(script)}\n\n提炼要点（ground truth）：\n${JSON.stringify(items)}`,
    { structuredOutput: { schema: reviewResultSchema } },
  );
  return result.object;
}

/**
 * 审稿 + 按需重写：不合格则重写脚本再评，达上限仍未通过则抛错（上层标记运行失败）。
 * 无内容（items 为空）直接放行，不触发 LLM。
 */
export async function reviewAndFix(
  script: DailyReportScript,
  items: ExtractItem[],
  deps: ReviewDeps = {},
): Promise<{ script: DailyReportScript; attempts: number }> {
  if (items.length === 0) return { script, attempts: 0 };

  const evaluate = deps.evaluate ?? defaultEvaluate;
  const rewrite = deps.rewrite ?? ((list: ExtractItem[]) => buildScript(list));

  let current = script;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) current = await rewrite(items);
    try {
      const review = await evaluate(current, items);
      if (review.verdict === "pass") return { script: current, attempts: attempt + 1 };
      logger.warn({ attempt, issues: review.issues }, "审稿未通过，重写脚本");
    } catch (err) {
      // 评估失败（含 structuredOutput 校验不过）按未通过处理，继续重试
      logger.warn({ err, attempt }, "审稿评估失败，按未通过处理");
    }
  }
  throw new Error(`脚本审稿 ${MAX_ATTEMPTS} 次未通过`);
}
