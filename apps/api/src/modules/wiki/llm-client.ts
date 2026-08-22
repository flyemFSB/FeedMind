import { generateText, Output } from "ai";
import type { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export type LlmMessage = { role: "system" | "user" | "assistant"; content: string };
export type LlmOptions = { responseFormat?: "json" | "text"; maxTokens?: number };

export interface LlmClient {
  chat(messages: LlmMessage[], opts?: LlmOptions): Promise<string>;
}

/** AI SDK 驱动 ingest 的 LLM 调用，与 chat 共用 provider 与网络层 */
export class AiSdkLlmClient implements LlmClient {
  constructor(
    private provider: ReturnType<typeof createOpenAICompatible>,
    private modelName: string,
    private maxTokens?: number,
  ) {}

  async chat(messages: LlmMessage[], opts: LlmOptions = {}): Promise<string> {
    const maxTokens = opts.maxTokens ?? this.maxTokens;
    // 提取 system 消息传入顶层 system 参数
    const systemText = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const rest = messages.filter((m) => m.role !== "system");
    const { text } = await generateText({
      model: this.provider.chatModel(this.modelName),
      ...(systemText ? { system: systemText } : {}),
      messages: rest.map((m) => ({ role: m.role, content: m.content })),
      temperature: 0.3,
      maxRetries: 3,
      ...(maxTokens !== undefined ? { maxOutputTokens: maxTokens } : {}),
      // 使用 Output.json() 确保返回合法 JSON
      ...(opts.responseFormat === "json" ? { output: Output.json() } : {}),
    });
    if (!text.trim()) {
      throw new Error("LLM 未返回内容");
    }
    return text;
  }
}

export class MockLlmClient implements LlmClient {
  constructor(private response: string) {}
  async chat(): Promise<string> {
    return this.response;
  }
}
