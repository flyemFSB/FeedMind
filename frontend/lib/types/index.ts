export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface AgentStep {
  id: string;
  label: string;
  status: "pending" | "running" | "completed";
  description?: string;
}

export interface Citation {
  id: string;
  label: string;
  title: string;
  url: string;
  source: string;
}

export interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  documentCount: number;
  chunkCount: number;
  updatedAt: string;
  tags: string[];
}

export interface Document {
  id: string;
  title: string;
  source: string;
  status: "pending" | "indexing" | "indexed" | "failed";
  chunkCount: number;
  updatedAt: string;
}

export interface LLMModel {
  id: string;
  provider: string;
  modelName: string;
  baseUrl: string;
  hasApiKey?: boolean;
}

export interface ReportSection {
  id: string;
  title: string;
  body: string;
  citations: string[];
}

export interface ReportPreview {
  id: string;
  title: string;
  subtitle: string;
  sections: ReportSection[];
}
