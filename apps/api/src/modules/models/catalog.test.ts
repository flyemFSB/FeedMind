import { describe, expect, it } from "vitest";
import { MIN_MAX_OUTPUT_K, isChatModel, mapCatalog, toKTokens } from "./catalog.js";

// 目录是"上下文窗口/最大输出"的唯一来源，映射错一处就会让整库模型的规格失真，
// 故把 K 换算、纯文本模型识别与输出上限过滤固定成回归测试（纯函数，不触网）。
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

describe("isChatModel", () => {
  it("保留纯文本对话模型与视觉等多模态输入（纯文本输出）模型", () => {
    expect(isChatModel("gpt-5.5", { modalities: { output: ["text"] } })).toBe(true);
    expect(isChatModel("no-modalities", {})).toBe(true);
  });

  it("排除输出含图像、音频、视频或 embedding 的非纯文本模型", () => {
    // 图像生成模型（如 Nano Banana、gpt-image）
    expect(isChatModel("gemini-3-pro-image", { modalities: { output: ["text", "image"] } })).toBe(
      false,
    );
    expect(isChatModel("gpt-image-1", { modalities: { output: ["image"] } })).toBe(false);
    // 语音/音频/音乐模型（如 Lyria、GPT-Realtime、TTS）
    expect(isChatModel("lyria-3-pro-preview", { modalities: { output: ["text", "audio"] } })).toBe(
      false,
    );
    expect(isChatModel("gemini-tts", { modalities: { output: ["audio"] } })).toBe(false);
    // 视频生成模型（如 Veo）
    expect(isChatModel("veo-3.1", { modalities: { output: ["video"] } })).toBe(false);
    // 嵌入向量模型
    expect(isChatModel("text-embedding-3-large", { modalities: { output: ["text"] } })).toBe(false);
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
        "gpt-boundary-32k": {
          name: "GPT Boundary 32K",
          release_date: "2026-01-15",
          limit: { context: 128_000, output: 32_000 },
          modalities: { output: ["text"] },
        },
        "gemini-3-pro-image": {
          name: "Nano Banana Pro",
          release_date: "2026-05-28",
          limit: { context: 131_072, output: 32_768 },
          modalities: { output: ["text", "image"] },
        },
        "gpt-legacy-16k": {
          name: "GPT Legacy 16K",
          release_date: "2025-01-01",
          limit: { context: 128_000, output: 16_000 },
          modalities: { output: ["text"] },
        },
        "text-embedding-3-large": {
          name: "Embedding",
          release_date: "2026-06-01",
          limit: { context: 8000, output: 32_000 },
        },
        "no-limit-model": { name: "No Limit", release_date: "2026-01-01" },
      },
    },
    anthropic: { models: {} },
  };

  it("MIN_MAX_OUTPUT_K 设定为 32K tokens", () => {
    expect(MIN_MAX_OUTPUT_K).toBe(32);
  });

  it("仅保留纯文本对话且最大输出 >= 32K 的模型，按发布时间倒序排列", () => {
    const catalog = mapCatalog(raw);
    expect(Object.keys(catalog)).toContain("ChatGPT");
    expect(catalog["ChatGPT"]?.map((m) => m.model_id)).toEqual([
      "gpt-5.5",
      "gpt-5.4",
      "gpt-boundary-32k",
    ]);
  });

  it("上下文与最大输出换算为 K", () => {
    const models = mapCatalog(raw)["ChatGPT"] ?? [];
    expect(models[0]).toMatchObject({
      model_id: "gpt-5.5",
      name: "GPT-5.5",
      context_window: 1050,
      max_output: 128,
    });
  });

  it("无数据的 provider 返回空数组而不是 undefined", () => {
    expect(mapCatalog(raw)["Claude"]).toEqual([]);
  });
});
