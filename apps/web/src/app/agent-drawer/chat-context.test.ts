import { describe, expect, it, vi } from "vitest";

interface ChatContextRegistry {
  __feedmindChatContext?: unknown;
}

/**
 * 这条报错（useChatContext must be used within ChatProvider）唯一可能的成因是 context 身份错位：
 * 树完全正确，但 Provider 与消费者各自持有一个 createContext 结果（HMR 或重复 chunk 导致模块被二次求值）。
 * 用模块二次求值模拟该场景，钉住「共享同一实例」。
 */
describe("chat-context 单例", () => {
  it("模块被重复求值后仍复用同一个 ChatContext", async () => {
    await import("./chat-context");
    const first = (globalThis as ChatContextRegistry).__feedmindChatContext;
    expect(first).toBeDefined();

    vi.resetModules();
    await import("./chat-context");
    expect((globalThis as ChatContextRegistry).__feedmindChatContext).toBe(first);
  });
});
