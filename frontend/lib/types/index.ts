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

export interface WikiSpace {
  id: string;
  name: string;
  description: string;
  category: "personal" | "team" | "web" | "code";
  pageCount: number;
  sourceCount: number;
  chunkCount: number;
  updatedAt: string;
  tags: string[];
}

export interface WikiPage {
  id: string;
  spaceId?: string;
  title: string;
  source: string;
  status: "pending" | "indexing" | "indexed" | "failed";
  chunkCount: number;
  relationCount: number;
  updatedAt: string;
  type?: WikiGraphNodeType;
}

export type WikiGraphNodeType =
  | "entity"
  | "concept"
  | "source"
  | "synthesis"
  | "comparison"
  | "overview"
  | "query"
  | "other";

export interface WikiGraphEdgeSignals {
  directLink: number;
  sourceOverlap: number;
  commonNeighbor: number;
  typeAffinity: number;
}

export interface WikiGraphNode {
  id: string;
  title: string;
  type: WikiGraphNodeType;
  status: WikiPage["status"];
  source: string;
  linkCount: number;
}

export interface WikiGraphEdge {
  source: string;
  target: string;
  weight: number;
  signals: WikiGraphEdgeSignals;
  relationType: string;
}

export interface WikiGraphCommunity {
  id: number;
  nodeCount: number;
  cohesion: number;
  topNodes: string[];
}

export interface WikiGraphInsight {
  id: string;
  type: "isolated-node" | "sparse-community" | "bridge-node" | "surprising-connection";
  title: string;
  description: string;
  nodeIds: string[];
}

export interface WikiGraphStats {
  nodeCount: number;
  edgeCount: number;
  pageCount: number;
  sourceCount: number;
}

export interface WikiGraphResponse {
  nodes: WikiGraphNode[];
  edges: WikiGraphEdge[];
  stats: WikiGraphStats;
}

export interface WikiSource {
  id: string;
  spaceId: string;
  filename: string;
  status: "pending" | "analyzing" | "generating" | "completed" | "failed";
  errorMessage: string;
  pageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface WikiIngestResult {
  sourceId: string;
  status: string;
  pageCount: number;
  writtenPaths: string[];
  error?: string | null;
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
