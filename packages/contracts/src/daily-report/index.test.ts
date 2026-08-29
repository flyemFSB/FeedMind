import { describe, expect, it } from "vitest";
import {
  scheduleUpsertSchema,
  dailyReportScriptSchema,
  extractOutputSchema,
  extractEvidenceSchema,
} from "./index.js";

describe("scheduleUpsertSchema", () => {
  it("接受合法的 cron 与名称", () => {
    const result = scheduleUpsertSchema.safeParse({
      name: "日报",
      cron: "0 8 * * *",
      enabled: true,
    });
    expect(result.success).toBe(true);
  });

  it("拒绝空名称与空 cron", () => {
    expect(scheduleUpsertSchema.safeParse({ name: "", cron: "0 8 * * *" }).success).toBe(false);
    expect(scheduleUpsertSchema.safeParse({ name: "日报", cron: "" }).success).toBe(false);
  });
});

describe("dailyReportScriptSchema", () => {
  const validScript = {
    date: "2026-08-09",
    opening: { hook: "早上好，今天是 8 月 9 日" },
    items: [
      {
        title: "示例标题",
        points: ["要点一", "要点二"],
        quote: null,
        narration: "我们来看看这条新闻。",
        source: "https://example.com/1",
        image: null,
      },
    ],
    closing: { summary: "今天的内容就到这里。" },
  };

  it("接受合法的分镜脚本", () => {
    expect(dailyReportScriptSchema.safeParse(validScript).success).toBe(true);
  });

  it("缺少 narration 时拒绝", () => {
    const { narration, ...rest } = validScript.items[0]!;
    expect(
      dailyReportScriptSchema.safeParse({
        ...validScript,
        items: [rest],
      }).success,
    ).toBe(false);
    void narration;
  });

  it("items 为空数组时允许（无内容的日报）", () => {
    expect(dailyReportScriptSchema.safeParse({ ...validScript, items: [] }).success).toBe(true);
  });
});

describe("extractEvidenceSchema", () => {
  it("接受合法的提炼证据对象", () => {
    const result = extractEvidenceSchema.safeParse({
      summary: "一句话摘要",
      facts: ["事实1", "事实2"],
      quotes: ["原文引语"],
      keyContext: "背景上下文",
    });
    expect(result.success).toBe(true);
  });

  it("缺省 facts/quotes/keyContext 时自动填充默认值", () => {
    const result = extractEvidenceSchema.safeParse({
      summary: "一句话摘要",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.facts).toEqual([]);
      expect(result.data.quotes).toEqual([]);
      expect(result.data.keyContext).toBe("");
    }
  });
});

describe("extractOutputSchema", () => {
  it("接受包含完整证据字段的要点列表", () => {
    const parsed = extractOutputSchema.safeParse({
      items: [
        {
          title: "A",
          url: "https://a",
          summary: "摘要",
          source: "来源",
          facts: ["数据点100万"],
          quotes: ["这是原话"],
          keyContext: "行业背景",
        },
      ],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.items[0]?.facts).toEqual(["数据点100万"]);
      expect(parsed.data.items[0]?.quotes).toEqual(["这是原话"]);
      expect(parsed.data.items[0]?.keyContext).toBe("行业背景");
    }
  });

  it("LLM 漏输出 facts/quotes/keyContext 时 default 补齐空默认值", () => {
    const parsed = extractOutputSchema.safeParse({
      items: [{ title: "A", url: "https://a", summary: "摘要", source: "来源" }],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.items[0]?.facts).toEqual([]);
      expect(parsed.data.items[0]?.quotes).toEqual([]);
      expect(parsed.data.items[0]?.keyContext).toBe("");
    }
  });

  it("缺 summary 时拒绝", () => {
    expect(
      extractOutputSchema.safeParse({
        items: [{ title: "A", url: "https://a", source: "来源" }],
      }).success,
    ).toBe(false);
  });
});
