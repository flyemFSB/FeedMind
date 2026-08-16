import { afterEach, describe, expect, it, vi } from "vitest";
import { LlmHttpError, OpenAiLlmClient } from "./llm-client.js";

// 429 限流重试：tpm exhausted 是分钟级窗口，退避后应能自动恢复，而不是直接让导入任务失败

function mockSseResponse(content: string): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        new TextEncoder().encode(
          `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n`,
        ),
      );
      controller.enqueue(new TextEncoder().encode("data: [DONE]\n"));
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

function mockErrorResponse(status: number, retryAfterSec?: number): Response {
  return new Response(JSON.stringify({ error: { message: "inference tpm exhausted" } }), {
    status,
    headers: {
      "content-type": "application/json",
      // 429 带 Retry-After 时走短退避，测试不必等 5s 指数退避
      ...(retryAfterSec ? { "retry-after": String(retryAfterSec) } : {}),
    },
  });
}

describe("OpenAiLlmClient 429 重试", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("429 后按 Retry-After 退避重试并成功", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(mockErrorResponse(429, 1))
      .mockResolvedValueOnce(mockSseResponse("ok"));
    vi.stubGlobal("fetch", fetchMock);

    const client = new OpenAiLlmClient({
      apiKey: "k",
      baseUrl: "https://example.com/v1",
      model: "m",
    });
    const result = await client.chat([{ role: "user", content: "hi" }]);

    expect(result).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("5xx 指数退避重试，最终仍失败则抛出 LlmHttpError", async () => {
    // mockImplementation 每次调用返回新 Response，避免 body 被首次 text() 消费后复用报错
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(mockErrorResponse(500))),
    );
    const client = new OpenAiLlmClient({
      apiKey: "k",
      baseUrl: "https://example.com/v1",
      model: "m",
    });

    // 4 次尝试（1 次直接 + 3 次重试）
    vi.useFakeTimers();
    const promise = client.chat([{ role: "user", content: "hi" }]);
    // 提前订阅 rejection，避免 fake timers flush 期间产生 unhandled rejection
    const assertion = expect(promise).rejects.toBeInstanceOf(LlmHttpError);
    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(70_000);
    }
    await assertion;
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(4);
    vi.useRealTimers();
  });

  it("400 参数错误不重试，直接抛出", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(mockErrorResponse(400));
    vi.stubGlobal("fetch", fetchMock);

    const client = new OpenAiLlmClient({
      apiKey: "k",
      baseUrl: "https://example.com/v1",
      model: "m",
    });
    await expect(client.chat([{ role: "user", content: "hi" }])).rejects.toBeInstanceOf(
      LlmHttpError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
