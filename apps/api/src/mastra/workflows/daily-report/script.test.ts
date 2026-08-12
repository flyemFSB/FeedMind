import { describe, expect, it } from "vitest";
import type { ExtractItem } from "@feedmind/contracts";
import { buildScript, fallbackScript, parseScriptJson } from "./script.js";

const items: ExtractItem[] = [
  { title: "标题A", url: "https://example.com/a", summary: "摘要A", source: "来源A" },
];

const validJson = JSON.stringify({
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
});

describe("parseScriptJson", () => {
  it("剥离 markdown 代码块后解析", () => {
    const script = parseScriptJson(`\`\`\`json\n${validJson}\n\`\`\``);
    expect(script.opening.hook).toBe("早上好");
    expect(script.items[0]?.narration).toBe("我们来看看标题A。");
  });

  it("非 JSON 文本抛错（触发调用方兜底）", () => {
    expect(() => parseScriptJson("抱歉，我无法生成")).toThrow();
  });
});

describe("buildScript", () => {
  it("LLM 生成合法 JSON 时采用生成结果", async () => {
    const script = await buildScript(items, { generateScript: async () => validJson });
    expect(script.opening.hook).toBe("早上好");
    expect(script.items).toHaveLength(1);
  });

  it("LLM 返回非法 JSON 时回退最小脚本", async () => {
    const script = await buildScript(items, {
      generateScript: async () => "这不是 JSON",
    });
    expect(script.opening.hook).toBeTruthy();
    expect(script.closing.summary).toBeTruthy();
    expect(script.items[0]?.narration).toBe("摘要A");
  });

  it("LLM 抛错时回退最小脚本", async () => {
    const script = await buildScript(items, {
      generateScript: async () => {
        throw new Error("模型不可用");
      },
    });
    expect(script.items[0]?.source).toBe("来源A");
  });

  it("空输入不触发 LLM，直接回退", async () => {
    let called = false;
    const script = await buildScript([], {
      generateScript: async () => {
        called = true;
        return validJson;
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
