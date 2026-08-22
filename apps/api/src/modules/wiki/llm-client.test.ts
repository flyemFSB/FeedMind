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
      | Record<string, string>
      | undefined;
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

  it("responseFormat=json 时经 Output.json() 请求体携带 response_format json_object，并校验合法 JSON", async () => {
    // 官方最佳实践：Output.json()（而非字符串 "json"）映射为 json_object；
    // 该模式同时校验返回确为合法 JSON（fence 包裹的非法 JSON 会被拒绝）
    const fetchMock = mockOkChat("{}");
    vi.stubGlobal("fetch", fetchMock);
    const client = makeClient();
    await client.chat([{ role: "user", content: "hi" }], { responseFormat: "json" });

    const init0 = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const body = JSON.parse(String(init0?.body));
    expect(body.response_format).toEqual({ type: "json_object" });
    // 非流式调用（generateText 默认），命中 openai chat completions 端点
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/chat/completions");
    expect(body.stream).not.toBe(true);
  });

  it("system 消息经顶层 system 传入（不触发 InvalidPromptError；指令仍随请求发出）", async () => {
    const fetchMock = mockOkChat("{}");
    vi.stubGlobal("fetch", fetchMock);
    const client = makeClient();
    // 回归：直接 generateText 传 messages 含 system role 会抛 InvalidPromptError，
    // 必须拆到顶层 system 选项；provider 组装 HTTP 请求时 system 会回到 messages[0]
    await expect(
      client.chat(
        [
          { role: "system", content: "你是助手" },
          { role: "user", content: "hi" },
        ],
        { responseFormat: "json" },
      ),
    ).resolves.toBe("{}");

    const init0 = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const body = JSON.parse(String(init0?.body));
    const joined = `${body.system ?? ""} ${JSON.stringify(body.messages ?? [])}`;
    expect(joined).toContain("你是助手");
  });

  it("Output.json() 拒绝非法 JSON（fence 包裹）", async () => {
    vi.stubGlobal("fetch", mockOkChat('```json\n{"a":1}\n```'));
    const client = makeClient();
    await expect(
      client.chat([{ role: "user", content: "hi" }], { responseFormat: "json" }),
    ).rejects.toThrow(/.+/);
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
