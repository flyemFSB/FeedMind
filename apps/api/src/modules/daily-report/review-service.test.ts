import { describe, expect, it } from "vitest";
import type { DailyReportScript, ExtractItem } from "@feedmind/contracts";
import { parseReview, reviewAndFix } from "./review-service.js";

const items: ExtractItem[] = [
  { title: "标题A", url: "https://example.com/a", summary: "摘要A", source: "来源A" },
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

const passJson = JSON.stringify({ verdict: "pass", issues: [] });
const failJson = JSON.stringify({ verdict: "fail", issues: ["来源标注不一致"] });

describe("parseReview", () => {
  it("剥离代码块后解析 pass", () => {
    expect(parseReview(`\`\`\`json\n${passJson}\n\`\`\``).verdict).toBe("pass");
  });

  it("非法 verdict 抛错", () => {
    expect(() => parseReview('{"verdict":"maybe","issues":[]}')).toThrow();
  });
});

describe("reviewAndFix", () => {
  it("首次评估通过即放行", async () => {
    let evaluated = 0;
    const result = await reviewAndFix(script, items, {
      evaluate: async () => {
        evaluated++;
        return passJson;
      },
    });
    expect(result.attempts).toBe(1);
    expect(evaluated).toBe(1);
  });

  it("首次未通过则重写后再次评估，通过返回", async () => {
    let evaluated = 0;
    let rewrites = 0;
    const rewritten: DailyReportScript = { ...script, opening: { hook: "重写后" } };
    const result = await reviewAndFix(script, items, {
      evaluate: async () => {
        evaluated++;
        return evaluated === 1 ? failJson : passJson;
      },
      rewrite: async () => {
        rewrites++;
        return rewritten;
      },
    });
    expect(result.attempts).toBe(2);
    expect(rewrites).toBe(1);
    expect(result.script.opening.hook).toBe("重写后");
  });

  it("达上限仍失败则抛错（上层标记运行失败）", async () => {
    await expect(
      reviewAndFix(script, items, {
        evaluate: async () => failJson,
      }),
    ).rejects.toThrow("审稿 3 次未通过");
  });

  it("评估输出无法解析按未通过处理并重试", async () => {
    const result = await reviewAndFix(script, items, {
      evaluate: async (s) => {
        if (s.opening.hook === "重写后") return passJson;
        return "无法解析的输出";
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
        return passJson;
      },
    });
    expect(result.attempts).toBe(0);
    expect(evaluated).toBe(false);
  });
});
