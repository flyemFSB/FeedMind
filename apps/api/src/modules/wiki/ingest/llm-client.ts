import { generateText } from "ai";
import type { ResolvedModelClient } from "../../models/model-cache.js";

export type LlmMessage = { role: "system" | "user" | "assistant"; content: string };
export type LlmOptions = { responseFormat?: "json" | "text"; maxTokens?: number };

export interface LlmClient {
  chat(messages: LlmMessage[], opts?: LlmOptions): Promise<string>;
}

/** AI SDK 驱动 ingest 的 LLM 调用，与 chat 共用 provider 与网络层 */
export class AiSdkLlmClient implements LlmClient {
  private provider: ResolvedModelClient;
  private modelName: string;
  private maxTokens?: number;

  constructor(provider: ResolvedModelClient, modelName: string, maxTokens?: number) {
    this.provider = provider;
    this.modelName = modelName;
    if (maxTokens !== undefined) {
      this.maxTokens = maxTokens;
    }
  }

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
    });
    if (!text.trim()) {
      throw new Error("LLM 未返回内容");
    }
    return text;
  }
}

export class MockLlmClient implements LlmClient {
  private response: string;

  constructor(response: string) {
    this.response = response;
  }

  async chat(): Promise<string> {
    return this.response;
  }
}
