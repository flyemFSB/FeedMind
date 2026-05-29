import type { RunnableConfig } from "@langchain/core/runnables";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { ConfigurableModel } from "langchain/chat_models/universal";
import { agentEnv } from "../env.js";
import { normalizeBaseUrl, resolveModelId, RuntimeConfigClient } from "./runtime-config.js";

type FeedMindModelFields = {
  model: string;
  temperature: number;
  backendApiUrl: string;
  apiBase?: string;
  apiKey?: string;
};

// 继承 ConfigurableModel 而非 BaseChatModel，利用其内置的供应商动态切换能力
// 在 _getModelInstance 中拦截并注入运行时模型配置（model_name / base_url / api_key）
export class FeedMindResponsesModel extends ConfigurableModel {
  model: string;
  temperature: number;
  backendApiUrl: string;
  apiBase?: string;
  apiKey?: string;

  private rcClient: RuntimeConfigClient;

  constructor(fields: FeedMindModelFields) {
    super({
      defaultConfig: { temperature: fields.temperature },
      configurableFields: "any",
    });
    this.model = fields.model;
    this.temperature = fields.temperature;
    this.backendApiUrl = fields.backendApiUrl;
    this.apiBase = fields.apiBase;
    this.apiKey = fields.apiKey;
    this.rcClient = new RuntimeConfigClient(fields.backendApiUrl);
  }

  // bindTools 返回新实例避免污染原始对象的状态
  bindTools(tools: StructuredToolInterface[], kwargs: Record<string, unknown> = {}): this {
    const next = new FeedMindResponsesModel({
      model: this.model,
      temperature: this.temperature,
      backendApiUrl: this.backendApiUrl,
      apiBase: this.apiBase,
      apiKey: this.apiKey,
    });
    // 将 bindTools 操作入队，等底层模型实例化后执行
    next._queuedMethodOperations = {
      ...this._queuedMethodOperations,
      bindTools: [tools, kwargs],
    };
    return next as this;
  }

  // 核心拦截点：从后台获取解密后的运行时配置，注入到 configurable 中再调父类实例化
  override async _getModelInstance(config?: RunnableConfig) {
    const modelId = resolveModelId(this.model, config);
    const signal = config?.signal as AbortSignal | undefined;
    const rc = await this.rcClient.getRuntimeConfig(modelId, signal);

    return super._getModelInstance({
      ...config,
      configurable: {
        model: rc.model_name,
        modelProvider: "openai",
        configuration: {
          baseURL: normalizeBaseUrl(rc.base_url || this.apiBase) ?? undefined,
        },
        apiKey: rc.api_key || this.apiKey || "not-set",
      },
    });
  }
}

// 使用环境变量创建模型实例，backendApiUrl 用于运行时向后端获取解密凭证
export function createFeedMindModel(): FeedMindResponsesModel {
  return new FeedMindResponsesModel({
    model: agentEnv.FEEDMIND_MODEL,
    backendApiUrl: agentEnv.BACKEND_API_URL,
    apiBase: agentEnv.OPENAI_COMPATIBLE_API_BASE,
    apiKey: agentEnv.OPENAI_COMPATIBLE_API_KEY,
    temperature: agentEnv.FEEDMIND_TEMPERATURE,
  });
}
