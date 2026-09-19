import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_SOURCE_CHARS,
  sourceChunkChars,
  splitSourceContent,
} from "./source-chunking.js";

describe("sourceChunkChars", () => {
  it("上下文窗口未知时退回默认上限", () => {
    expect(sourceChunkChars({ contextTokens: null, outputTokens: 8_000, promptChars: 5_000 })).toBe(
      DEFAULT_MAX_SOURCE_CHARS,
    );
  });

  it("大上下文与输出窗口模型：动态计算分块字符预算", () => {
    const chars = sourceChunkChars({
      contextTokens: 1_000_000,
      outputTokens: 384_000,
      promptChars: 10_000,
    });
    expect(chars).toBe(604_000);
    expect(chars).toBeGreaterThan(DEFAULT_MAX_SOURCE_CHARS);
  });

  it("小窗口模型：提示词与输出按比例预留后动态收紧分块预算", () => {
    const chars = sourceChunkChars({
      contextTokens: 128_000,
      outputTokens: 64_000,
      promptChars: 2_000,
    });
    expect(chars).toBe(60_000);
    expect(chars).toBeLessThan(DEFAULT_MAX_SOURCE_CHARS);
  });

  it("预算被占满时退到下限而不是返回 0/负数", () => {
    expect(
      sourceChunkChars({ contextTokens: 8_000, outputTokens: 8_000, promptChars: 4_000 }),
    ).toBe(2_000);
  });
});

describe("splitSourceContent", () => {
  it("短内容不切块", () => {
    expect(splitSourceContent("abc", 10)).toEqual(["abc"]);
  });

  it("按上限切块并优先落在段落边界，每块不超上限", () => {
    const paragraph = "x".repeat(600);
    const content = Array.from({ length: 12 }, () => paragraph).join("\n\n");
    const chunks = splitSourceContent(content, 2_000);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(2_000);
    // 段落边界优先：切点处不应把某个段落截断
    expect(chunks.every((chunk) => chunk.length % 601 === 600 || chunk.length < 2_000)).toBe(true);
    expect(chunks.join("").replace(/\s/g, "")).toBe(content.replace(/\s/g, ""));
  });
});
