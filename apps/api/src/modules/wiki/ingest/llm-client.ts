import { defaultSettingsMiddleware, generateText, wrapLanguageModel } from "ai";
import type { ResolvedModelClient } from "../../models/model-cache.js";
import { logger } from "../../../lib/logger.js";

export type LlmMessage = { role: "system" | "user" | "assistant"; content: string };
export type LlmOptions = { responseFormat?: "json" | "text"; maxTokens?: number };

export interface LlmClientOptions {
  /** 模型配置的真实输出上限（parseTokenCount 结果）；未配置则不下发 max_tokens */
  maxTokens?: number;
  /** 默认开启思考的模型：采样参数上游不生效，下发只会换来 AI SDK 告警 */
  thinkingByDefault?: boolean;
  /** 采样参数取自 runtime 配置（runtime_config.wiki），不在代码里写死默认值 */
  temperature?: number;
  topP?: number;
}

export interface LlmClient {
  chat(messages: LlmMessage[], opts?: LlmOptions): Promise<string>;
}

/** AI SDK 驱动 ingest 的 LLM 调用，与 chat 共用 provider 与网络层 */
export class AiSdkLlmClient implements LlmClient {
  private provider: ResolvedModelClient;
  private modelName: string;
  private maxTokens?: number;
  private thinkingByDefault: boolean;
  private temperature?: number;
  private topP?: number;

  constructor(provider: ResolvedModelClient, modelName: string, opts: LlmClientOptions = {}) {
    this.provider = provider;
    this.modelName = modelName;
    this.thinkingByDefault = opts.thinkingByDefault ?? false;
    if (opts.maxTokens !== undefined) this.maxTokens = opts.maxTokens;
    if (opts.temperature !== undefined) this.temperature = opts.temperature;
    if (opts.topP !== undefined) this.topP = opts.topP;
  }

  async chat(messages: LlmMessage[], opts: LlmOptions = {}): Promise<string> {
    const maxTokens = opts.maxTokens ?? this.maxTokens;
    // 提取 system 消息传入顶层 system 参数
    const systemText = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const rest = messages.filter((m) => m.role !== "system");
    const model = this.provider.chatModel(this.modelName);
    // 采样参数来自 runtime 配置；未配置就不下发，交端点默认。思考模型整组跳过：
    // 上游会丢弃它们（AI SDK 每次调用都报告警），传了只会误导读日志的人
    const sampling = this.thinkingByDefault
      ? {}
      : {
          ...(this.temperature !== undefined ? { temperature: this.temperature } : {}),
          ...(this.topP !== undefined ? { topP: this.topP } : {}),
        };
    const { text, finishReason, reasoningText, usage } = await generateText({
      // 结构化输出开关从模型层注入：generateText 顶层的 responseFormat 是死参数（内部被
      // output?.responseFormat 覆盖为 undefined），而 output: Output.json() 解析失败即抛错（围栏 JSON
      // 直接失败），与本层“返回原文、由上层 parseJsonSafe 容错解析”的约定冲突。middleware 只改线上参数：
      // DeepSeek/兼容端点写 response_format，OpenAI Responses 写 text.format；schema 留空走 json_object
      model:
        opts.responseFormat === "json"
          ? wrapLanguageModel({
              model,
              middleware: defaultSettingsMiddleware({
                settings: { responseFormat: { type: "json" } },
              }),
            })
          : model,
      ...(systemText ? { system: systemText } : {}),
      messages: rest.map((m) => ({ role: m.role, content: m.content })),
      ...sampling,
      maxRetries: 3,
      ...(maxTokens !== undefined ? { maxOutputTokens: maxTokens } : {}),
    });
    // 用量记账：字段名与 chat 侧 onStepFinish 对齐，两链路可按同一套 key 汇总出成本
    logger.debug(
      {
        modelId: this.modelName,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadTokens: usage.inputTokenDetails.cacheReadTokens,
        cacheWriteTokens: usage.inputTokenDetails.cacheWriteTokens,
      },
      "模型调用 Token 用量统计",
    );
    if (!text.trim()) {
      // 思考模型的推理内容不进 text（独立 reasoning part），所以这里不会把 CoT 当正文。
      // 空正文最常见的原因是推理吃满 max_tokens（finish_reason=length）或上游只回了推理，带上证据便于定位
      throw new Error(
        `LLM 未返回内容（finish_reason=${finishReason}${reasoningText ? "，仅返回推理内容" : ""}）`,
      );
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
