import { describe, expect, it } from "vitest";
import { scheduleUpsertSchema, dailyReportScriptSchema, extractOutputSchema } from "./index.js";

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

describe("extractOutputSchema", () => {
  it("接受合法要点列表", () => {
    expect(
      extractOutputSchema.safeParse({
        items: [{ title: "A", url: "https://a", summary: "摘要", source: "来源" }],
      }).success,
    ).toBe(true);
  });

  it("缺 summary 时拒绝", () => {
    expect(
      extractOutputSchema.safeParse({
        items: [{ title: "A", url: "https://a", source: "来源" }],
      }).success,
    ).toBe(false);
  });
});
