import { z } from "zod";

// ─── Wiki 空间 ──────────────────────────────────────────────
export const wikiTemplateSchema = z.enum([
  "research",
  "reading",
  "personal",
  "business",
  "general",
]);
export type WikiTemplate = z.infer<typeof wikiTemplateSchema>;

export const wikiSpaceSettingsSchema = z.object({
  language: z.string().default("zh-CN"),
  enabledPageTypes: z.array(z.string()).default([]),
  extraDirs: z.array(z.string()).default([]),
});
export type WikiSpaceSettings = z.infer<typeof wikiSpaceSettingsSchema>;

export const wikiSpaceCreateSchema = z.object({
  name: z.string().min(1).max(128),
  template: wikiTemplateSchema.default("general"),
  purpose: z.string().default(""),
  schema: z.string().default(""),
  settings: wikiSpaceSettingsSchema,
});
export type WikiSpaceCreate = z.infer<typeof wikiSpaceCreateSchema>;

export const wikiSpaceUpdateSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  purpose: z.string().optional(),
  schema: z.string().optional(),
  settings: wikiSpaceSettingsSchema.optional(),
});
export type WikiSpaceUpdate = z.infer<typeof wikiSpaceUpdateSchema>;

export const wikiSpaceReadSchema = z.object({
  id: z.string(),
  name: z.string(),
  template: wikiTemplateSchema,
  purpose: z.string(),
  schema: z.string(),
  settings: wikiSpaceSettingsSchema,
  page_count: z.number().int().nonnegative().default(0),
  source_count: z.number().int().nonnegative().default(0),
  created_at: z.string(),
  updated_at: z.string(),
});
export type WikiSpaceRead = z.infer<typeof wikiSpaceReadSchema>;

export const wikiSpaceListItemSchema = wikiSpaceReadSchema.pick({
  id: true,
  name: true,
  template: true,
  page_count: true,
  source_count: true,
  created_at: true,
  updated_at: true,
});
export type WikiSpaceListItem = z.infer<typeof wikiSpaceListItemSchema>;

// ─── OKF Concept 页面 ───────────────────────────────────────────
export const wikiPageTypeSchema = z.string().trim().min(1);
export type WikiPageType = z.infer<typeof wikiPageTypeSchema>;

// ─── 知识形态 type 受控枚举 ─────────────────────────────────
// 单一数据源：约束 AI 生成、前端分组标签、索引分组顺序。
// 存储层仍接受任意字符串 type（OKF 规范要求容忍未知类型），此枚举仅用于规约与展示。
export const WIKI_CONCEPT_TYPES = [
  "Concept",
  "Principle",
  "Method",
  "Technology",
  "Application",
  "Trend",
  "Reference",
  "Metric",
] as const;
export type WikiConceptType = (typeof WIKI_CONCEPT_TYPES)[number];

/** Concept 概念类型到中文展示标签的映射（知识形态维度）；未识别类型由消费端回退为原始英文或"概念"。 */
export const WIKI_CONCEPT_TYPE_LABELS: Record<string, string> = {
  Concept: "概念",
  Principle: "原理",
  Method: "方法",
  Technology: "技术",
  Application: "应用",
  Trend: "趋势",
  Reference: "参考",
  Metric: "指标",
};

export const wikiPageCreateSchema = z.object({
  path: z.string().min(1).max(512),
  type: wikiPageTypeSchema.default("Reference"),
  title: z.string().min(1).max(256),
  description: z.string().max(1000).optional(),
  resource: z.string().max(2048).optional(),
  content: z.string().default(""),
  tags: z.array(z.string()).default([]),
  frontmatter: z.record(z.string(), z.unknown()).default({}),
});
export type WikiPageCreate = z.infer<typeof wikiPageCreateSchema>;

export const wikiPageUpdateSchema = z.object({
  path: z.string().min(1).max(512).optional(),
  type: wikiPageTypeSchema.optional(),
  title: z.string().min(1).max(256).optional(),
  description: z.string().max(1000).optional(),
  resource: z.string().max(2048).optional(),
  content: z.string().optional(),
  tags: z.array(z.string()).optional(),
  frontmatter: z.record(z.string(), z.unknown()).optional(),
});
export type WikiPageUpdate = z.infer<typeof wikiPageUpdateSchema>;

export const wikiPageReadSchema = z.object({
  id: z.string(),
  space_id: z.string(),
  path: z.string(),
  concept_id: z.string(),
  slug: z.string(),
  type: wikiPageTypeSchema,
  title: z.string(),
  description: z.string().default(""),
  resource: z.string().nullable().default(null),
  content: z.string(),
  frontmatter: z.record(z.string(), z.unknown()).default({}),
  tags: z.array(z.string()).default([]),
  timestamp: z.string().default(""),
});
export type WikiPageRead = z.infer<typeof wikiPageReadSchema>;

export const wikiPageListItemSchema = wikiPageReadSchema.pick({
  id: true,
  space_id: true,
  path: true,
  concept_id: true,
  slug: true,
  type: true,
  title: true,
  description: true,
  resource: true,
  tags: true,
  timestamp: true,
});
export type WikiPageListItem = z.infer<typeof wikiPageListItemSchema>;

// ─── Wiki 来源 ─────────────────────────────────────────────────
export const wikiSourceKindSchema = z.enum(["file", "text", "url", "clip", "generated", "image"]);
export type WikiSourceKind = z.infer<typeof wikiSourceKindSchema>;

export const wikiSourceStatusSchema = z.enum([
  "new",
  "queued",
  "ingesting",
  "ready",
  "ingested",
  "failed",
  "deleted",
]);
export type WikiSourceStatus = z.infer<typeof wikiSourceStatusSchema>;

export const wikiSourceCreateSchema = z.object({
  kind: wikiSourceKindSchema.default("text"),
  title: z.string().min(1).max(256),
  original_name: z.string().optional(),
  original_uri: z.string().optional(),
  content: z.string().default(""),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type WikiSourceCreate = z.infer<typeof wikiSourceCreateSchema>;

export const wikiSourceReadSchema = z.object({
  id: z.string(),
  space_id: z.string(),
  identity: z.string(),
  title: z.string(),
  kind: wikiSourceKindSchema,
  original_name: z.string().nullable(),
  original_uri: z.string().nullable(),
  storage_path: z.string().nullable(),
  mime_type: z.string().nullable(),
  size_bytes: z.number().int().nonnegative().nullable(),
  content_hash: z.string().nullable(),
  status: wikiSourceStatusSchema,
  metadata: z.record(z.string(), z.unknown()).default({}),
  page_count: z.number().int().nonnegative().default(0),
  created_at: z.string(),
  updated_at: z.string(),
});
export type WikiSourceRead = z.infer<typeof wikiSourceReadSchema>;

export const wikiSourceListItemSchema = wikiSourceReadSchema.pick({
  id: true,
  space_id: true,
  identity: true,
  title: true,
  kind: true,
  original_name: true,
  mime_type: true,
  status: true,
  page_count: true,
  created_at: true,
  updated_at: true,
});
export type WikiSourceListItem = z.infer<typeof wikiSourceListItemSchema>;

// ─── Wiki 链接 / 反向链接 ───────────────────────────────────────
export const wikiLinkStatusSchema = z.enum(["resolved", "missing", "ambiguous"]);
export type WikiLinkStatus = z.infer<typeof wikiLinkStatusSchema>;

export const wikiBacklinkSchema = z.object({
  page_id: z.string(),
  slug: z.string(),
  title: z.string(),
  path: z.string(),
});
export type WikiBacklink = z.infer<typeof wikiBacklinkSchema>;

// ─── Wiki 解析 ─────────────────────────────────────────────────
export type WikiResolveQuery = { target: string };

export const wikiResolveResultSchema = z.object({
  resolved: z.boolean(),
  page_id: z.string().nullable(),
  slug: z.string().nullable(),
  title: z.string().nullable(),
  status: wikiLinkStatusSchema,
  candidates: z
    .array(
      z.object({
        page_id: z.string(),
        path: z.string(),
        title: z.string(),
        slug: z.string(),
      }),
    )
    .default([]),
});
export type WikiResolveResult = z.infer<typeof wikiResolveResultSchema>;

// ─── 图谱类型 ──────────────────────────────────────────────────
export type GraphNode = {
  id: string;
  label: string;
  type: string;
  path: string;
  linkCount: number;
  community?: number;
};

export type GraphEdge = {
  source: string;
  target: string;
  weight: number;
};

export type CommunityInfo = {
  id: number;
  nodeCount: number;
  cohesion: number;
  topNodes: string[];
};

export type WikiGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  communities: CommunityInfo[];
};

// ─── 搜索类型 ──────────────────────────────────────────────────
export type WikiSearchResult = {
  path: string;
  title: string;
  snippet: string;
  titleMatch: boolean;
  score: number;
};

export type WikiSearchResponse = {
  mode: "keyword" | "hybrid";
  results: WikiSearchResult[];
  totalHits: number;
};

// ─── 导入队列类型 ──────────────────────────────────────────────
export const ingestJobStatusSchema = z.enum([
  "pending",
  "processing",
  "done",
  "failed",
  "cancelled",
]);
export type IngestJobStatus = z.infer<typeof ingestJobStatusSchema>;

export const ingestProgressSchema = z.object({
  message: z.string(),
  step: z.number().int().min(0),
  totalSteps: z.number().int().min(1),
});
export type IngestProgress = z.infer<typeof ingestProgressSchema>;

export const ingestJobSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  source_path: z.string(),
  source_title: z.string().default(""),
  folder_context: z.string().default(""),
  status: ingestJobStatusSchema.default("pending"),
  progress: ingestProgressSchema.nullable().default(null),
  added_at: z.number(),
  started_at: z.number().nullable().default(null),
  completed_at: z.number().nullable().default(null),
  error: z.string().nullable().default(null),
  retry_count: z.number().int().default(0),
  written_files: z.array(z.string()).default([]),
  pages_created: z.number().int().default(0),
  pages_updated: z.number().int().default(0),
});
export type IngestJob = z.infer<typeof ingestJobSchema>;
