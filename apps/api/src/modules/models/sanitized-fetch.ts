/**
 * 一些 OpenAI 兼容 API（如 Sensenova）在流式 tool_calls delta 中发送
 * "type":"" 和 "id":"" 而非 "type":"function" 和有效 ID。
 * @ai-sdk/openai 的流式解析器拒绝空字符串，因此需在 fetch 层修复。
 *
 * 另：Sensenova 免费模型 RPM 配额极低（约 5-6 次/分钟），task 工具每次调用
 * 都会创建 subagent 发起新的 LLM 请求，瞬时易触发 429（rpm exhausted）。
 * 这里对 429 做指数退避重试（滚动窗口约 15s 恢复）。
 */
export function createSanitizedFetch(_baseUrl?: string) {
  return async (input: string | URL | Request, init?: RequestInit) => {
    let response = await globalThis.fetch(input, init);

    let attempt = 0;
    while (response.status === 429 && attempt < 3) {
      await response.body?.cancel().catch(() => {});
      const retryAfter = response.headers.get("retry-after");
      const baseDelay = retryAfter ? Number(retryAfter) * 1000 : 8_000 * 2 ** attempt;
      const delay = Number.isFinite(baseDelay) && baseDelay > 0 ? baseDelay : 8_000 * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delay * (0.5 + Math.random() * 0.5)));
      if (init?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      response = await globalThis.fetch(input, init);
      attempt++;
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/event-stream") || !response.body) {
      return response;
    }

    let buffer = "";
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const transformStream = new TransformStream({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.choices) {
                for (const choice of parsed.choices) {
                  if (choice.delta?.tool_calls) {
                    for (const tc of choice.delta.tool_calls) {
                      if (tc.type === "") tc.type = "function";
                      if (tc.id === "") tc.id = crypto.randomUUID();
                    }
                  }
                }
              }
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(parsed)}\n`));
            } catch {
              controller.enqueue(encoder.encode(line + "\n"));
            }
          } else {
            controller.enqueue(encoder.encode(line + "\n"));
          }
        }
      },
      flush(controller) {
        if (buffer) {
          controller.enqueue(encoder.encode(buffer));
        }
      },
    });

    return new Response(response.body.pipeThrough(transformStream), {
      headers: response.headers,
      status: response.status,
      statusText: response.statusText,
    });
  };
}
