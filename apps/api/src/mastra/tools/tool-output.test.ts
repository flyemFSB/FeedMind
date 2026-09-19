import { describe, expect, it } from "vitest";
import { TOOL_OUTPUT_MAX_CHARS, truncateForModel } from "./tool-output.js";

describe("truncateForModel", () => {
  it("不超上限时原样返回", () => {
    expect(truncateForModel("短文本")).toBe("短文本");
    const exact = "a".repeat(100);
    expect(truncateForModel(exact, 100)).toBe(exact);
  });

  it("超上限时保留头尾并标注省略字符数", () => {
    const text = "H".repeat(700) + "T".repeat(300);
    const result = truncateForModel(text, 100);

    expect(result.startsWith("H".repeat(70))).toBe(true);
    expect(result.endsWith("T".repeat(30))).toBe(true);
    expect(result).toContain("已省略 900 字符");
    // 头 70 + 尾 30 = 上限，标记本身不计入（它是给模型看的提示，不是内容）
    expect(Array.from(result.replace(/\n\n\[\.\.\..*?\.\.\.\]\n\n/s, "")).length).toBe(100);
  });

  it("默认工具输出截断上限为 30K 字符", () => {
    expect(TOOL_OUTPUT_MAX_CHARS).toBe(30_000);

    const text = "字".repeat(60_000);
    const result = truncateForModel(text);
    expect(result).toContain("已省略 30000 字符");
    expect(Array.from(result.replace(/\n\n\[\.\.\..*?\.\.\.\]\n\n/s, "")).length).toBe(30_000);

    expect(truncateForModel("字".repeat(5_000))).toHaveLength(5_000);
  });

  it("按 code point 截断，不切开代理对", () => {
    const emoji = "🙂".repeat(100);
    const result = truncateForModel(emoji, 40);
    expect(result).not.toContain("\ud83d\n");
    expect(Array.from(result.replace(/\n\n\[\.\.\..*?\.\.\.\]\n\n/s, "")).length).toBe(40);
  });
});
