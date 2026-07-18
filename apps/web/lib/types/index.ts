export interface LLMModel {
  id: string;
  type?: "chat" | "embedding";
  provider: string;
  modelName: string;
  modelId?: string;
  baseUrl: string;
  hasApiKey?: boolean;
  contextWindow?: string | null;
  maxOutput?: string | null;
}
