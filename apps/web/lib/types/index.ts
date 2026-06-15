export interface LLMModel {
  id: string;
  provider: string;
  modelName: string;
  modelId?: string;
  baseUrl: string;
  hasApiKey?: boolean;
  contextWindow?: string | null;
  maxOutput?: string | null;
}
