import { describe, expect, it } from "vitest";
import { formatModelDisplayName, displayNameToModelId } from "./provider-models";

describe("formatModelDisplayName", () => {
  it("应正确美化预置模型调用名称", () => {
    expect(formatModelDisplayName("deepseek-v4-flash")).toBe("DeepSeek V4 Flash");
    expect(formatModelDisplayName("deepseek-v4-pro")).toBe("DeepSeek V4 Pro");
    expect(formatModelDisplayName("gpt-5.5")).toBe("GPT 5.5");
    expect(formatModelDisplayName("claude-opus-4.8")).toBe("Claude Opus 4.8");
    expect(formatModelDisplayName("gemini-3.1-pro")).toBe("Gemini 3.1 Pro");
    expect(formatModelDisplayName("glm-5.1")).toBe("GLM 5.1");
    expect(formatModelDisplayName("kimi-k2.6")).toBe("Kimi K2.6");
    expect(formatModelDisplayName("qwen-3.7-plus")).toBe("Qwen 3.7 Plus");
  });

  it("应正确美化非预置的各类自定义模型调用名称", () => {
    expect(formatModelDisplayName("deepseek-chat")).toBe("DeepSeek Chat");
    expect(formatModelDisplayName("deepseek-reasoner")).toBe("DeepSeek Reasoner");
    expect(formatModelDisplayName("deepseek-r1")).toBe("DeepSeek R1");
    expect(formatModelDisplayName("gpt-4o-mini")).toBe("GPT 4o Mini");
    expect(formatModelDisplayName("claude-3-5-sonnet-20241022")).toBe("Claude 3.5 Sonnet 20241022");
    expect(formatModelDisplayName("qwen-2.5-72b-instruct")).toBe("Qwen 2.5 72B Instruct");
    expect(formatModelDisplayName("glm-4-flash")).toBe("GLM 4 Flash");
  });

  it("应支持包含组织前缀/斜杠路径的模型名称", () => {
    expect(formatModelDisplayName("deepseek-ai/DeepSeek-V3")).toBe("DeepSeek V3");
    expect(formatModelDisplayName("meta-llama/Llama-3.3-70B-Instruct")).toBe(
      "Llama 3.3 70B Instruct",
    );
  });

  it("空字符串或空白应返回空", () => {
    expect(formatModelDisplayName("")).toBe("");
    expect(formatModelDisplayName("   ")).toBe("");
  });
});

describe("displayNameToModelId", () => {
  it("应正确将显示名称转为 modelId", () => {
    expect(displayNameToModelId("DeepSeek V4 Flash")).toBe("deepseek-v4-flash");
    expect(displayNameToModelId("Claude Opus 4.8")).toBe("claude-opus-4.8");
  });
});
