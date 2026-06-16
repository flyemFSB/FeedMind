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

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        response_format: opts.responseFormat === "json" ? { type: "json_object" } : undefined,
        max_tokens: maxTokens,
        temperature: 0.3,
      }),
    });

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

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content: string | undefined = data.choices?.[0]?.message?.content;
    if (content === undefined || content === null) {
      throw new Error("LLM returned empty response");
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
