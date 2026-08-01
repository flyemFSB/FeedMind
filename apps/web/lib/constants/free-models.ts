export interface FreeModelPreset {
  type: "chat" | "embedding";
  provider: string;
  modelName: string;
  modelId: string;
  baseUrl: string;
  /** 获取 API Key 的链接 */
  signupUrl: string;
  /** 流程说明文案 */
  description: string;
}

/** 免费模型接入预设：点击「添加免费模型」时按 preset 引导接入 */
export const FREE_MODEL_PRESETS = {
  agnesChat: {
    type: "chat",
    provider: "Agnes",
    modelName: "Agnes 2.5 Flash",
    modelId: "agnes-2.5-flash",
    baseUrl: "https://apihub.agnes-ai.cn/v1",
    signupUrl: "https://platform.agnes-ai.cn",
    description:
      "Agnes 2.5 Flash 是 Agnes AI 的免费对话模型，OpenAI 兼容。前往 Agnes AI 平台注册并生成 API Key 后，填入下方即可一键接入。",
  },
  siliconFlowEmbedding: {
    type: "embedding",
    provider: "硅基流动",
    modelName: "BAAI/bge-m3",
    modelId: "BAAI/bge-m3",
    baseUrl: "https://api.siliconflow.cn/v1",
    signupUrl: "https://cloud.siliconflow.cn/me/account/ak",
    description:
      "BAAI/bge-m3 是硅基流动（SiliconFlow）的免费嵌入模型，用于向量检索。前往硅基流动控制台生成 API Key 后填入下方即可接入。",
  },
} as const;
