import { afterEach, describe, expect, it, vi } from "vitest";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { AiSdkLlmClient } from "./llm-client.js";

// AI SDK 非流式调用走全局 fetch POST /chat/completions；mock 标准 OpenAI 响应。
// AI SDK 会话校验：响应 header 的 x-request-id 必须与请求一致，否则忽略响应体。
function buildChatResponse(content: string, requestId?: string) {
  return new Response(
    JSON.stringify({
      id: "chatcmpl-test",
      object: "chat.completion",
      created: 1,
      model: "m",
      choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json",
        ...(requestId ? { "x-request-id": requestId } : {}),
      },
    },
  );
}

function mockOkChat(content: string) {
  return vi.fn<typeof fetch>().mockImplementation((_input, init) => {
    const headers = (init as RequestInit | undefined)?.headers as
      Record<string, string> | undefined;
    const requestId =
      (typeof headers?.["x-request-id"] === "string" ? headers["x-request-id"] : undefined) ??
      (headers && "x-request-id" in headers
        ? String((headers as Record<string, unknown>)["x-request-id"])
        : undefined);
    return Promise.resolve(buildChatResponse(content, requestId));
  });
}

function makeClient(maxTokens?: number) {
  const provider = createOpenAICompatible({
    name: "test",
    apiKey: "k",
    baseURL: "https://example.com/v1",
  });
  return new AiSdkLlmClient(provider, "test-model", maxTokens);
}

afterEach(() => vi.unstubAllGlobals());

describe("AiSdkLlmClient", () => {
  it("返回模型生成的文本", async () => {
    vi.stubGlobal("fetch", mockOkChat("ok"));
    const client = makeClient();
    const result = await client.chat([{ role: "user", content: "hi" }]);
    expect(result).toBe("ok");
  });

  it("responseFormat=json 请求正常完成并返回 LLM 响应文本", async () => {
    const fetchMock = mockOkChat('{"status":"ok"}');
    vi.stubGlobal("fetch", fetchMock);
    const client = makeClient();
    const res = await client.chat([{ role: "user", content: "hi" }], { responseFormat: "json" });

    expect(res).toBe('{"status":"ok"}');
    // 非流式调用（generateText 默认），命中 openai chat completions 端点
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/chat/completions");
  });

  it("LLM 返回带 fence 围栏的文本时正常返回（由上层 parseJsonSafe 解析）", async () => {
    vi.stubGlobal("fetch", mockOkChat('```json\n{"a":1}\n```'));
    const client = makeClient();
    const res = await client.chat([{ role: "user", content: "hi" }], { responseFormat: "json" });
    expect(res).toContain('{"a":1}');
  });

  it("模型配置 maxTokens 透传为 max_tokens；调用级优先", async () => {
    const fetchMock = mockOkChat("{}");
    vi.stubGlobal("fetch", fetchMock);
    const client = makeClient(8192);

    await client.chat([{ role: "user", content: "hi" }]);
    let body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.max_tokens).toBe(8192);

    await client.chat([{ role: "user", content: "hi" }], { maxTokens: 16000 });
    body = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(body.max_tokens).toBe(16000);
  });

  it("模型返回空文本时抛错（避免把空结果当成功）", async () => {
    vi.stubGlobal("fetch", mockOkChat(""));
    const client = makeClient();
    await expect(client.chat([{ role: "user", content: "hi" }])).rejects.toThrow("LLM 未返回内容");
  });
});
