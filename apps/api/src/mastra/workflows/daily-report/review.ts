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
  /** 重写脚本：默认走 buildScript（script agent），支持接收上一轮 issues 进行修正 */
  rewrite?: (
    items: ExtractItem[],
    options?: { previousIssues?: string[] },
  ) => Promise<DailyReportScript>;
}

async function defaultEvaluate(
  script: DailyReportScript,
  items: ExtractItem[],
): Promise<ReviewResult> {
  const result = await reviewAgent.generate(
    `分镜脚本：\n${JSON.stringify(script, null, 2)}\n\n提炼要点证据链（ground truth）：\n${JSON.stringify(items, null, 2)}`,
    { structuredOutput: { schema: reviewResultSchema } },
  );
  return result.object;
}

/**
 * 审稿 + 自我修正重写循环：不合格则将具体 issues 回灌给 rewrite 重新生成，再评；
 * 达到重试上限仍未通过则抛错（上层标记运行失败）。
 * 无内容（items 为空）直接放行，不触发 LLM。
 */
export async function reviewAndFix(
  script: DailyReportScript,
  items: ExtractItem[],
  deps: ReviewDeps = {},
): Promise<{ script: DailyReportScript; attempts: number }> {
  if (items.length === 0) return { script, attempts: 0 };

  const evaluate = deps.evaluate ?? defaultEvaluate;
  const rewrite =
    deps.rewrite ??
    ((list: ExtractItem[], opts?: { previousIssues?: string[] }) => buildScript(list, {}, opts));

  let current = script;
  let lastIssues: string[] = [];
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      current = await rewrite(items, { previousIssues: lastIssues });
    }
    try {
      const review = await evaluate(current, items);
      if (review.verdict === "pass") return { script: current, attempts: attempt + 1 };
      lastIssues = review.issues;
      logger.warn({ attempt, issues: review.issues }, "审稿未通过，回灌问题并重写脚本");
    } catch (err) {
      // 评估失败（含 structuredOutput 校验不过）按未通过处理继续重试；
      // 异常文本不是审稿意见，不回灌 rewrite，沿用上一轮真实 issues 引导修正
      logger.warn({ err, attempt }, "审稿评估失败，按未通过处理");
    }
  }
  throw new Error(`脚本审稿 ${MAX_ATTEMPTS} 次未通过`);
}
