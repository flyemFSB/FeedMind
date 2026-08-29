import { describe, expect, it } from "vitest";
import type { DailyReportScript, ExtractItem } from "@feedmind/contracts";
import type { ReviewResult } from "./review.js";
import { reviewAndFix } from "./review.js";

const items: ExtractItem[] = [
  {
    title: "标题A",
    url: "https://example.com/a",
    summary: "摘要A",
    source: "来源A",
    facts: ["要点"],
    quotes: [],
    keyContext: "背景A",
  },
];

const script: DailyReportScript = {
  date: "2026-08-09",
  opening: { hook: "早上好" },
  items: [
    {
      title: "标题A",
      points: ["要点"],
      quote: null,
      narration: "摘要A",
      source: "来源A",
      image: null,
    },
  ],
  closing: { summary: "总结" },
};

const passResult: ReviewResult = { verdict: "pass", issues: [] };
const failResult: ReviewResult = { verdict: "fail", issues: ["来源标注不一致"] };

describe("reviewAndFix", () => {
  it("首次评估通过即放行", async () => {
    let evaluated = 0;
    const result = await reviewAndFix(script, items, {
      evaluate: async () => {
        evaluated++;
        return passResult;
      },
    });
    expect(result.attempts).toBe(1);
    expect(evaluated).toBe(1);
  });

  it("首次未通过则将 issues 回灌给 rewrite，重写后再次评估通过并返回", async () => {
    let evaluated = 0;
    let rewrites = 0;
    let receivedIssues: string[] | undefined;
    const rewritten: DailyReportScript = { ...script, opening: { hook: "重写后" } };
    const result = await reviewAndFix(script, items, {
      evaluate: async () => {
        evaluated++;
        return evaluated === 1
          ? { verdict: "fail", issues: ["深度不足：缺少背景与趋势分析", "引用不真实"] }
          : passResult;
      },
      rewrite: async (_list, options) => {
        rewrites++;
        receivedIssues = options?.previousIssues;
        return rewritten;
      },
    });
    expect(result.attempts).toBe(2);
    expect(rewrites).toBe(1);
    expect(receivedIssues).toEqual(["深度不足：缺少背景与趋势分析", "引用不真实"]);
    expect(result.script.opening.hook).toBe("重写后");
  });

  it("达上限仍失败则抛错（上层标记运行失败）", async () => {
    await expect(
      reviewAndFix(script, items, {
        evaluate: async () => failResult,
      }),
    ).rejects.toThrow("审稿 3 次未通过");
  });

  it("评估抛错（含 structuredOutput 校验失败）按未通过处理并重试", async () => {
    const result = await reviewAndFix(script, items, {
      evaluate: async (s) => {
        if (s.opening.hook === "重写后") return passResult;
        throw new Error("structuredOutput 校验失败");
      },
      rewrite: async () => ({ ...script, opening: { hook: "重写后" } }),
    });
    expect(result.attempts).toBe(2);
  });

  it("无内容（items 为空）直接放行，不触发评估", async () => {
    let evaluated = false;
    const result = await reviewAndFix(script, [], {
      evaluate: async () => {
        evaluated = true;
        return passResult;
      },
    });
    expect(result.attempts).toBe(0);
    expect(evaluated).toBe(false);
  });
});
