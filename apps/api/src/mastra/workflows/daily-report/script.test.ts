import { describe, expect, it } from "vitest";
import type { DailyReportScript, ExtractItem } from "@feedmind/contracts";
import { buildScript, fallbackScript } from "./script.js";

const items: ExtractItem[] = [
  { title: "标题A", url: "https://example.com/a", summary: "摘要A", source: "来源A" },
];

const validScript: DailyReportScript = {
  date: "2026-08-09",
  opening: { hook: "早上好" },
  items: [
    {
      title: "标题A",
      points: ["要点一"],
      quote: null,
      narration: "我们来看看标题A。",
      source: "来源A",
      image: null,
    },
  ],
  closing: { summary: "今天的内容就到这里。" },
};

describe("buildScript", () => {
  it("LLM 生成合法脚本时采用生成结果", async () => {
    const script = await buildScript(items, { generateScript: async () => validScript });
    expect(script.opening.hook).toBe("早上好");
    expect(script.items).toHaveLength(1);
  });

  it("生成抛错（含 schema 校验失败）时回退最小脚本", async () => {
    const script = await buildScript(items, {
      generateScript: async () => {
        throw new Error("structuredOutput 校验失败");
      },
    });
    expect(script.opening.hook).toBeTruthy();
    expect(script.closing.summary).toBeTruthy();
    expect(script.items[0]?.narration).toBe("摘要A");
  });

  it("空输入不触发 LLM，直接回退", async () => {
    let called = false;
    const script = await buildScript([], {
      generateScript: async () => {
        called = true;
        return validScript;
      },
    });
    expect(called).toBe(false);
    expect(script.items).toEqual([]);
  });
});

describe("fallbackScript", () => {
  it("条目映射为最小脚本（summary 作旁白）", () => {
    const script = fallbackScript(items);
    expect(script.items[0]).toMatchObject({
      title: "标题A",
      narration: "摘要A",
      source: "来源A",
      points: [],
      quote: null,
      image: null,
    });
  });
});
