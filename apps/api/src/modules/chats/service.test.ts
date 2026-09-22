import { describe, expect, it, vi } from "vitest";

const recall = vi.hoisted(() => vi.fn());

vi.mock("../../mastra/agents/feedmind-agent.js", () => ({
  feedmindAgent: { getMemory: async () => ({ recall }) },
}));

const { getChatSessionMessages } = await import("./service.js");

/** 构造 Mastra 记忆返回的 v2 消息（按 LibSQLStore.parseRow 的形状） */
function dbMessage(id: string, role: "user" | "assistant", parts: unknown[]) {
  return {
    id,
    role,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    threadId: "t1",
    resourceId: "t1",
    content: { format: 2, parts },
  };
}

describe("getChatSessionMessages", () => {
  it("一次读完整个会话，不做页码切片", async () => {
    recall.mockResolvedValue({ messages: [], total: 0 });
    await getChatSessionMessages("t1");
    // 观察记忆会往消息流里插封存行，按页码切片会让窗口错位并截断回合
    expect(recall).toHaveBeenCalledWith({ threadId: "t1", perPage: false });
  });

  it("用户输入与同一回合的多条助手记录一起返回，助手记录合并为一条回复", async () => {
    recall.mockResolvedValue({
      messages: [
        dbMessage("u1", "user", [{ type: "text", text: "总结 github trending" }]),
        dbMessage("a1", "assistant", [
          { type: "reasoning", reasoning: "先抓页面" },
          {
            type: "tool-invocation",
            toolInvocation: {
              state: "result",
              toolCallId: "c1",
              toolName: "web_fetch",
              args: { url: "https://github.com/trending" },
              result: "页面内容",
            },
          },
        ]),
        dbMessage("a2", "assistant", [{ type: "text", text: "最终回答" }]),
      ],
      total: 3,
    });

    const messages = await getChatSessionMessages("t1");

    expect(messages.map((m) => m.id)).toEqual(["u1", "a1"]);
    expect(messages[0]?.parts).toEqual([
      expect.objectContaining({ type: "text", text: "总结 github trending" }),
    ]);
    expect(messages[1]?.parts.map((p) => p.type)).toEqual(["reasoning", "tool-web_fetch", "text"]);
  });
});
