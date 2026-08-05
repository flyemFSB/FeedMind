export type LlmMessage = { role: "system" | "user" | "assistant"; content: string };
export type LlmOptions = { responseFormat?: "json" | "text"; maxTokens?: number };

export interface LlmClient {
  chat(messages: LlmMessage[], opts?: LlmOptions): Promise<string>;
}

export class OpenAiLlmClient implements LlmClient {
  constructor(
    private config: {
      apiKey: string;
      baseUrl: string;
      model: string;
    },
  ) {}

  async chat(messages: LlmMessage[], opts: LlmOptions = {}): Promise<string> {
    const baseUrl = this.config.baseUrl.replace(/\/$/, "");
    const model = this.config.model;
    const maxTokens = opts.maxTokens ?? 4096;

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          // 流式：响应头立即返回，绕开 undici 默认 300s headersTimeout，
          // 长输出（OKF 生成 8192 tokens）不会因迟迟收不到响应头而超时
          stream: true,
          response_format: opts.responseFormat === "json" ? { type: "json_object" } : undefined,
          max_tokens: maxTokens,
          temperature: 0.3,
        }),
        // 总超时兜底：流式下只要持续有数据就不会提前中断
        signal: AbortSignal.timeout(600_000),
      });
    } catch (err) {
      if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
        throw new Error("LLM 请求超时（10 分钟未收到完整响应）", { cause: err });
      }
      throw err;
    }

    if (!response.ok) {
      let errorBody: string;
      try {
        errorBody = await response.text();
      } catch {
        errorBody = "(读取错误响应体失败)";
      }
      throw new Error(`LLM API 错误 (${response.status}): ${errorBody.slice(0, 500)}`, {
        cause: response,
      });
    }

    if (!response.body) {
      throw new Error("LLM 流式响应缺少 body");
    }

    // 按 SSE 逐行解析，累积 delta.content
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let content = "";
    let buffer = "";
    let streamEnded = false;

    while (!streamEnded) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") {
          streamEnded = true;
          buffer = "";
          break;
        }
        try {
          const parsed = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const delta = parsed.choices?.[0]?.delta?.content;
          if (typeof delta === "string") content += delta;
        } catch {
          // 忽略无法解析的行（如 keep-alive 心跳）
        }
      }
    }

    if (!content) {
      throw new Error("LLM 流式响应为空");
    }
    return content;
  }
}

export class MockLlmClient implements LlmClient {
  constructor(private response: string) {}
  async chat(): Promise<string> {
    return this.response;
  }
}
