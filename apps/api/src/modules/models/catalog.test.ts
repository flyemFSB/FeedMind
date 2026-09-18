import { describe, expect, it } from "vitest";
import { mapCatalog, toKTokens } from "./catalog.js";

// 目录是"上下文窗口/最大输出"的唯一来源，映射错一处就会让整库模型的上限失真，
// 故把 K 换算、过滤规则与排序固定成回归测试（纯函数，不触网）。
describe("toKTokens", () => {
  it("token 绝对值换算为 K（DB 与 UI 单位一致）", () => {
    expect(toKTokens(1_000_000)).toBe(1000);
    expect(toKTokens(128_000)).toBe(128);
    expect(toKTokens(8191)).toBe(8);
  });

  it("不足 1K 记 1K，非法/缺失值返回 null", () => {
    expect(toKTokens(500)).toBe(1);
    expect(toKTokens(0)).toBeNull();
    expect(toKTokens(-1)).toBeNull();
    expect(toKTokens(undefined)).toBeNull();
  });
});

describe("mapCatalog", () => {
  const raw = {
    openai: {
      models: {
        "gpt-5.5": {
          name: "GPT-5.5",
          release_date: "2026-04-23",
          limit: { context: 1_050_000, output: 128_000 },
          modalities: { output: ["text"] },
        },
        "gpt-5.4": {
          name: "GPT-5.4",
          release_date: "2026-02-01",
          limit: { context: 400_000, output: 64_000 },
          modalities: { output: ["text"] },
        },
        "gpt-image-2": {
          name: "GPT Image 2",
          release_date: "2026-05-01",
          modalities: { output: ["image"] },
        },
        "text-embedding-3-large": { name: "Embedding", release_date: "2026-06-01" },
        "no-limit-model": { name: "No Limit", release_date: "2026-01-01" },
      },
    },
    anthropic: { models: {} },
  };

  it("用展示名做 key，映射到 models.dev 的 provider", () => {
    const catalog = mapCatalog(raw);
    expect(Object.keys(catalog)).toContain("ChatGPT");
    expect(catalog["ChatGPT"]?.map((m) => m.model_id)).toEqual([
      "gpt-5.5",
      "gpt-5.4",
      "no-limit-model",
    ]);
  });

  it("过滤非对话模型（图像输出、embedding）", () => {
    const ids = mapCatalog(raw)["ChatGPT"]?.map((m) => m.model_id) ?? [];
    expect(ids).not.toContain("gpt-image-2");
    expect(ids).not.toContain("text-embedding-3-large");
  });

  it("上下文与最大输出换算为 K，上游缺失 limit 时为 null", () => {
    const models = mapCatalog(raw)["ChatGPT"] ?? [];
    expect(models[0]).toMatchObject({
      model_id: "gpt-5.5",
      name: "GPT-5.5",
      context_window: 1050,
      max_output: 128,
    });
    expect(models[2]).toMatchObject({ context_window: null, max_output: null });
  });

  it("无数据的 provider 返回空数组而不是 undefined", () => {
    expect(mapCatalog(raw)["Claude"]).toEqual([]);
  });
});
