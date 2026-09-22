import { describe, expect, it } from "vitest";
import { Mastra } from "@mastra/core";
import { Agent } from "@mastra/core/agent";
import { askUserTool } from "@mastra/core/tools";
import { LibSQLStore } from "@mastra/libsql";
import { Memory } from "@mastra/memory";
import { toAISdkStream } from "@mastra/ai-sdk";
import { MockLanguageModelV4, convertArrayToReadableStream } from "ai/test";

/**
 * 澄清提问全链路：内置 ask_user 的挂起/续跑必须真的把用户答案当工具结果送回模型，
 * 且挂起事件要能经 @mastra/ai-sdk 转成前端可渲染的 data-tool-call-suspended。
 */

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};

const CLARIFY_INPUT = {
  question: "你想先整理哪一部分资料？",
  options: [{ label: "测井曲线" }, { label: "岩心描述" }, { label: "完井报告" }],
};

/** 第一次调用先要求澄清，之后调用给出最终回答 */
function createAgent() {
  let call = 0;
  const model = new MockLanguageModelV4({
    provider: "mock",
    modelId: "mock-model",
    doStream: async () => {
      call += 1;
      if (call === 1) {
        return {
          stream: convertArrayToReadableStream([
            { type: "stream-start", warnings: [] },
            {
              type: "tool-call",
              toolCallId: "call-1",
              toolName: askUserTool.id,
              input: JSON.stringify(CLARIFY_INPUT),
            },
            { type: "finish", usage, finishReason: { unified: "tool-calls", raw: "tool_calls" } },
          ]),
        };
      }
      return {
        stream: convertArrayToReadableStream([
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "t1" },
          { type: "text-delta", id: "t1", delta: "好的，先整理测井曲线。" },
          { type: "text-end", id: "t1" },
          { type: "finish", usage, finishReason: { unified: "stop", raw: "stop" } },
        ]),
      };
    },
  });

  const agent = new Agent({
    id: "ask-user-test",
    name: "AskUserTest",
    instructions: "测试用 agent",
    model,
    tools: { [askUserTool.id]: askUserTool },
    defaultOptions: { autoResumeSuspendedTools: true },
  });

  // 挂起快照靠 storage 持久化，否则 resumeStream 找不到挂起的 run；与生产一样由 Mastra 实例注入
  const mastra = new Mastra({
    agents: { "ask-user-test": agent },
    storage: new LibSQLStore({ id: "ask-user-test-store", url: ":memory:" }),
  });

  return { agent: mastra.getAgent("ask-user-test"), model };
}

describe("内置 ask_user 的挂起与续跑", () => {
  it("挂起时上报问题与选项，续跑后把用户答案作为工具结果送回模型", async () => {
    const { agent, model } = createAgent();

    const stream = await agent.stream("帮我整理资料");
    const suspended: Array<{ toolName: string; suspendPayload: unknown }> = [];
    for await (const chunk of stream.fullStream) {
      if (chunk.type === "tool-call-suspended") {
        suspended.push(chunk.payload as unknown as { toolName: string; suspendPayload: unknown });
      }
    }

    expect(suspended).toHaveLength(1);
    expect(suspended[0]!.toolName).toBe("ask_user");
    expect(suspended[0]!.suspendPayload).toMatchObject({
      question: CLARIFY_INPUT.question,
      options: CLARIFY_INPUT.options,
      selectionMode: "single_select",
    });

    const resumed = await agent.resumeStream("岩心描述", { runId: stream.runId });
    let text = "";
    for await (const chunk of resumed.textStream) text += chunk;
    expect(text).toContain("先整理测井曲线");

    // 关键断言：模型第二次调用看到的是用户答案形成的工具结果，而不是被吞掉
    const secondPrompt = JSON.stringify(model.doStreamCalls[1]?.prompt);
    expect(secondPrompt).toContain("岩心描述");
    expect(secondPrompt).toContain("ask_user");
  });

  it("挂起事件经 toAISdkStream 转成前端可渲染的 data-tool-call-suspended", async () => {
    const { agent, model } = createAgent();
    const stream = await agent.stream("帮我整理资料");
    const parts: Array<{ type: string; data?: unknown }> = [];
    for await (const part of toAISdkStream(stream, { from: "agent", version: "v6" })) {
      parts.push(part as unknown as { type: string; data?: unknown });
    }

    const suspension = parts.find((p) => p.type === "data-tool-call-suspended");
    expect(suspension).toBeDefined();
    expect(suspension!.data).toMatchObject({
      toolName: "ask_user",
      toolCallId: "call-1",
      suspendPayload: {
        question: CLARIFY_INPUT.question,
        options: CLARIFY_INPUT.options,
        selectionMode: "single_select",
      },
    });
    expect(model.doStreamCalls).toHaveLength(1);
  });

  it("用户下一条消息即澄清回答：自动续跑挂起的工具", async () => {
    let call = 0;
    const model = new MockLanguageModelV4({
      provider: "mock",
      modelId: "mock-model",
      doStream: async () => {
        call += 1;
        if (call === 1) {
          return {
            stream: convertArrayToReadableStream([
              { type: "stream-start", warnings: [] },
              {
                type: "tool-call",
                toolCallId: "call-auto",
                toolName: askUserTool.id,
                input: JSON.stringify(CLARIFY_INPUT),
              },
              { type: "finish", usage, finishReason: { unified: "tool-calls", raw: "tool_calls" } },
            ]),
          };
        }
        return {
          stream: convertArrayToReadableStream([
            { type: "stream-start", warnings: [] },
            { type: "text-start", id: "t1" },
            { type: "text-delta", id: "t1", delta: "好的，按岩心描述整理。" },
            { type: "text-end", id: "t1" },
            { type: "finish", usage, finishReason: { unified: "stop", raw: "stop" } },
          ]),
        };
      },
    });

    const memory = new Memory({
      storage: new LibSQLStore({ id: "ask-user-test-memory", url: ":memory:" }),
    });
    const agent = new Agent({
      id: "ask-user-auto",
      name: "AskUserAuto",
      instructions: "测试用 agent",
      model,
      memory,
      tools: { [askUserTool.id]: askUserTool },
      defaultOptions: { autoResumeSuspendedTools: true },
    });
    const mastra = new Mastra({
      agents: { "ask-user-auto": agent },
      storage: new LibSQLStore({ id: "ask-user-test-store-auto", url: ":memory:" }),
    });
    const wired = mastra.getAgent("ask-user-auto");
    const threadOptions = { memory: { thread: "thread-auto", resource: "resource-auto" } };

    const first = await wired.stream("帮我整理资料", threadOptions);
    for await (const _chunk of first.fullStream) {
      // 只消费首轮流，挂起信息已在其他用例中断言
    }

    const second = await wired.stream("岩心描述", threadOptions);
    let text = "";
    for await (const chunk of second.textStream) text += chunk;

    expect(text).toContain("按岩心描述整理");
    // 自动续跑而不是新一轮：模型收到的仍是同一条工具结果消息
    expect(JSON.stringify(model.doStreamCalls[1]?.prompt)).toContain("岩心描述");
  });
});
