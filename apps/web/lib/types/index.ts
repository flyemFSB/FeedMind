export interface LLMModel {
  id: string;
  provider: string;
  modelName: string;
  baseUrl: string;
  hasApiKey?: boolean;
}
