import type { ExtractFeed } from "@feedmind/contracts";
import { z } from "zod";
import { logger } from "../../../lib/logger.js";
import { extractAgent } from "../../agents/extract-agent.js";

// 输入 ≤5 条直接放行不筛选；LLM 精选结果最多保留 8 条
const MIN_SELECT_COUNT = 5;
const MAX_SELECT_COUNT = 8;

export const selectFeedsResultSchema = z.object({
  selectedIndices: z.array(z.number().int()).describe("精选出的 feed 序号列表（0-indexed，5-8条）"),
  reasoning: z.string().optional().describe("选题理由概述"),
  rejected: z
    .array(
      z.object({
        index: z.number().int(),
        reason: z.string(),
      }),
    )
    .optional()
    .describe("未选中条目的序号与淘汰原因"),
});

export type SelectFeedsResult = z.infer<typeof selectFeedsResultSchema>;

export interface SelectDeps {
  /** 选题筛选评估器；默认使用 extractAgent 进行单次轻量 LLM 结构化选择 */
  evaluate?: (feeds: ExtractFeed[]) => Promise<SelectFeedsResult>;
}

async function defaultEvaluate(feeds: ExtractFeed[]): Promise<SelectFeedsResult> {
  const feedListStr = feeds
    .map(
      (f, i) =>
        `[${i}] 《${f.title}》（来源：${f.source}）\n摘要/导语：${(f.description ?? "").slice(0, 150)}`,
    )
    .join("\n\n");

  const prompt = `你是日报主编。请从以下 ${feeds.length} 条待选新闻中，综合评估「重要性（对行业/社会的影响）× 新颖性 × 信息量」，精选出 5-8 条最值得在今日视频中深度解读的新闻序号：\n\n${feedListStr}\n\n要求：
1. 优先挑选重大事件、突破性进展、具有深度解读空间的话题；
2. 过滤琐碎快讯、重复公关通稿；
3. 输出 5-8 个选中的序号（selectedIndices），并在 rejected 中逐条给出未选中序号与淘汰原因。`;

  const result = await extractAgent.generate(prompt, {
    structuredOutput: { schema: selectFeedsResultSchema },
  });
  return result.object;
}

/**
 * 选题筛选：少而精是深度解读的前提。
 * 输入 <= 5 条时直接放行；> 5 条时通过 LLM 筛选 5-8 条高价值资讯；
 * 筛选失败时回退为截取前 8 条内容。
 */
export async function selectFeeds(
  feeds: ExtractFeed[],
  deps: SelectDeps = {},
): Promise<ExtractFeed[]> {
  if (feeds.length <= MIN_SELECT_COUNT) {
    return feeds;
  }

  const evaluate = deps.evaluate ?? defaultEvaluate;
  try {
    const { selectedIndices, reasoning, rejected } = await evaluate(feeds);
    const validIndices = selectedIndices.filter((idx) => idx >= 0 && idx < feeds.length);
    const uniqueIndices = Array.from(new Set(validIndices));

    if (uniqueIndices.length >= 3) {
      const selected = uniqueIndices.slice(0, MAX_SELECT_COUNT).map((idx) => feeds[idx]!);
      logger.info(
        { selectedCount: selected.length, total: feeds.length, reasoning },
        "日报选题筛选完成",
      );
      if (rejected?.length) {
        logger.info({ rejected }, "日报未入选选题明细");
      }
      return selected;
    }

    logger.warn({ count: uniqueIndices.length }, "符合条件的选题偏少，回退为前 8 条默认内容");
    return feeds.slice(0, MAX_SELECT_COUNT);
  } catch (err) {
    logger.warn({ err, total: feeds.length }, "选题筛选异常，回退为截取前 8 条内容");
    return feeds.slice(0, MAX_SELECT_COUNT);
  }
}
