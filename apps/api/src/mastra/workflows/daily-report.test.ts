import { describe, expect, it } from "vitest";
import type {
  DailyReportScript,
  ExtractEvidence,
  ExtractFeed,
  ExtractItem,
} from "@feedmind/contracts";
import { createDailyReportWorkflow, type DailyReportDeps } from "./daily-report/index.js";

// 7 条输入（> MIN_SELECT_COUNT=5）才会走 LLM 筛选路径，用于验证 select 产出真的流入 extract
const FEEDS: ExtractFeed[] = Array.from({ length: 7 }, (_, i) => ({
  id: `feed-${i}`,
  title: `新闻标题 ${i}`,
  link: `https://example.com/${i}`,
  description: `新闻 ${i} 的简述`,
  source: "来源A",
}));

const RUN_INIT = { runId: "test-run", scheduleId: "daily-video", feeds: FEEDS };

const SCRIPT: DailyReportScript = {
  date: "2026-08-09",
  opening: { hook: "开场钩子" },
  items: [
    {
      title: "新闻标题 2",
      points: ["要点一"],
      quote: null,
      narration: "旁白内容",
      source: "来源A",
      image: null,
    },
  ],
  closing: { summary: "收尾总结" },
};

const EVIDENCE: ExtractEvidence = {
  summary: "摘要",
  facts: ["事实一"],
  quotes: [],
  keyContext: "",
};

/** 记录各注入点实际收到的入参，用于断言步骤间的数据流 */
function makeProbe() {
  const probe = {
    selectCalls: [] as ExtractFeed[][],
    fetchedUrls: [] as string[],
    extractCalls: [] as Array<{ text: string; title: string }>,
    scriptItems: [] as ExtractItem[][],
    reviewCalls: [] as Array<{ script: DailyReportScript; items: ExtractItem[] }>,
  };
  const deps: DailyReportDeps = {
    select: {
      evaluate: async (feeds) => {
        probe.selectCalls.push(feeds);
        // 至少 3 条才被 selectFeeds 视为有效筛选结果，否则回退前 8 条
        return { selectedIndices: [2, 3, 4] };
      },
    },
    extract: {
      searchBackground: async () => undefined,
      fetchText: async (url) => {
        probe.fetchedUrls.push(url);
        return `正文：${url}`;
      },
      extractEvidence: async (text, title) => {
        probe.extractCalls.push({ text, title });
        return EVIDENCE;
      },
    },
    script: {
      generateScript: async (items) => {
        probe.scriptItems.push(items);
        return SCRIPT;
      },
    },
    review: {
      evaluate: async (script, items) => {
        probe.reviewCalls.push({ script, items });
        return { verdict: "pass", issues: [] };
      },
    },
  };
  return { probe, deps };
}

describe("dailyReportWorkflow 编排", () => {
  it("按序执行五步", async () => {
    const run = await createDailyReportWorkflow(makeProbe().deps).createRun();
    const result = await run.start({ inputData: RUN_INIT });

    expect(result.status).toBe("success");
    if (result.status !== "success") throw new Error("workflow 运行失败");

    expect(result.stepExecutionPath).toEqual([
      "fetch-sources",
      "select-feeds",
      "extract",
      "script",
      "review",
    ]);
  });

  it("每一步的产出都是下一步的入参", async () => {
    const { probe, deps } = makeProbe();
    const run = await createDailyReportWorkflow(deps).createRun();
    const result = await run.start({ inputData: RUN_INIT });
    if (result.status !== "success") throw new Error("workflow 运行失败");

    // fetch-sources 透传全部 7 条给 select
    expect(probe.selectCalls).toEqual([FEEDS]);

    // select 只留下序号 2/3/4，extract 便只应抓取这三条（证明 select 产出真的流入 extract）
    expect(probe.fetchedUrls).toEqual([
      "https://example.com/2",
      "https://example.com/3",
      "https://example.com/4",
    ]);
    expect(probe.extractCalls).toEqual([
      { text: "正文：https://example.com/2", title: "新闻标题 2" },
      { text: "正文：https://example.com/3", title: "新闻标题 3" },
      { text: "正文：https://example.com/4", title: "新闻标题 4" },
    ]);

    // extract 的条目流入 script，script 与条目一并流入 review
    expect(probe.scriptItems).toHaveLength(1);
    expect(probe.scriptItems[0]?.map((i) => i.title)).toEqual([
      "新闻标题 2",
      "新闻标题 3",
      "新闻标题 4",
    ]);
    expect(probe.reviewCalls).toHaveLength(1);
    expect(probe.reviewCalls[0]?.script).toEqual(SCRIPT);
    expect(probe.reviewCalls[0]?.items).toEqual(probe.scriptItems[0]);

    // 审稿一次即通过时，最终产物就是 script 的产出
    expect(result.result.script).toEqual(SCRIPT);
  });

  it("审稿未通过时回灌重写，最终产物为重写版本", async () => {
    const { deps } = makeProbe();
    const rewritten: DailyReportScript = { ...SCRIPT, opening: { hook: "重写后的钩子" } };
    const issuesSeen: Array<string[] | undefined> = [];
    let evaluates = 0;

    deps.review = {
      evaluate: async () => {
        evaluates += 1;
        return evaluates === 1
          ? { verdict: "fail" as const, issues: ["来源标注不一致"] }
          : { verdict: "pass" as const, issues: [] };
      },
      rewrite: async (_items, options) => {
        issuesSeen.push(options?.previousIssues);
        return rewritten;
      },
    };

    const run = await createDailyReportWorkflow(deps).createRun();
    const result = await run.start({ inputData: RUN_INIT });
    if (result.status !== "success") throw new Error("workflow 运行失败");

    expect(result.result.script).toEqual(rewritten);
    // 重写必须带上首轮审稿发现的 issues，否则重写无从修正
    expect(issuesSeen).toEqual([["来源标注不一致"]]);
  });
});
