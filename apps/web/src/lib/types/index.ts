export interface LLMModel {
  id: string;
  type?: "chat" | "embedding" | "ocr";
  provider: string;
  modelName: string;
  modelId?: string;
  baseUrl: string;
  hasApiKey?: boolean;
  /** 上下文窗口（单位：K tokens） */
  contextWindow?: number | null;
  /** 最大输出（单位：K tokens） */
  maxOutput?: number | null;
}
