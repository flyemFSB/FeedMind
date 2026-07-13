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
  enabledPageTypes: z.array(z.string()).default(["entity", "concept", "source", "overview"]),
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

// ─── Wiki 页面 ─────────────────────────────────────────────────
export const wikiPageTypeSchema = z.enum(["entity", "concept", "source", "overview", "index"]);
export type WikiPageType = z.infer<typeof wikiPageTypeSchema>;

export const wikiPageCreateSchema = z.object({
  path: z.string().min(1).max(512),
  type: wikiPageTypeSchema.default("concept"),
  title: z.string().min(1).max(256),
  content: z.string().default(""),
  sources: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  related: z.array(z.string()).default([]),
});
export type WikiPageCreate = z.infer<typeof wikiPageCreateSchema>;

export const wikiPageUpdateSchema = z.object({
  path: z.string().min(1).max(512).optional(),
  title: z.string().min(1).max(256).optional(),
  content: z.string().optional(),
  sources: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  related: z.array(z.string()).optional(),
});
export type WikiPageUpdate = z.infer<typeof wikiPageUpdateSchema>;

export const wikiPageReadSchema = z.object({
  id: z.string(),
  space_id: z.string(),
  path: z.string(),
  slug: z.string(),
  type: wikiPageTypeSchema,
  title: z.string(),
  content: z.string(),
  frontmatter: z.record(z.string(), z.unknown()).default({}),
  sources: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  related: z.array(z.string()).default([]),
  created_at: z.string(),
  updated_at: z.string(),
});
export type WikiPageRead = z.infer<typeof wikiPageReadSchema>;

export const wikiPageListItemSchema = wikiPageReadSchema.pick({
  id: true,
  space_id: true,
  path: true,
  slug: true,
  type: true,
  title: true,
  tags: true,
  created_at: true,
  updated_at: true,
});
export type WikiPageListItem = z.infer<typeof wikiPageListItemSchema>;

// ─── Wiki 来源 ─────────────────────────────────────────────────
export const wikiSourceKindSchema = z.enum(["file", "text", "url", "clip", "generated"]);
export type WikiSourceKind = z.infer<typeof wikiSourceKindSchema>;

export const wikiSourceStatusSchema = z.enum([
  "new",
  "queued",
  "ingesting",
  "ready",
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
export const wikiResolveQuerySchema = z.object({
  target: z.string().min(1),
});
export type WikiResolveQuery = z.infer<typeof wikiResolveQuerySchema>;

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
export const graphNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.string(),
  path: z.string(),
  linkCount: z.number().int().default(0),
  community: z.number().int().default(0).optional(),
});
export type GraphNode = z.infer<typeof graphNodeSchema>;

export const graphEdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  weight: z.number().default(1),
});
export type GraphEdge = z.infer<typeof graphEdgeSchema>;

export const communityInfoSchema = z.object({
  id: z.number().int(),
  nodeCount: z.number().int(),
  cohesion: z.number(),
  topNodes: z.array(z.string()),
});
export type CommunityInfo = z.infer<typeof communityInfoSchema>;

export const wikiGraphSchema = z.object({
  nodes: z.array(graphNodeSchema),
  edges: z.array(graphEdgeSchema),
  communities: z.array(communityInfoSchema),
});
export type WikiGraph = z.infer<typeof wikiGraphSchema>;

// ─── 搜索类型 ──────────────────────────────────────────────────
export const wikiSearchResultSchema = z.object({
  path: z.string(),
  title: z.string(),
  snippet: z.string(),
  titleMatch: z.boolean(),
  score: z.number(),
});
export type WikiSearchResult = z.infer<typeof wikiSearchResultSchema>;

export const wikiSearchResponseSchema = z.object({
  mode: z.enum(["keyword", "hybrid"]),
  results: z.array(wikiSearchResultSchema),
  totalHits: z.number().int(),
});
export type WikiSearchResponse = z.infer<typeof wikiSearchResponseSchema>;

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

// ─── Lint 类型 ─────────────────────────────────────────────────
export const lintResultTypeSchema = z.enum(["orphan", "broken-link", "no-outlinks", "semantic"]);
export type LintResultType = z.infer<typeof lintResultTypeSchema>;

export const lintSeveritySchema = z.enum(["warning", "info"]);
export type LintSeverity = z.infer<typeof lintSeveritySchema>;

export const lintResultSchema = z.object({
  type: lintResultTypeSchema,
  severity: lintSeveritySchema,
  page: z.string(),
  detail: z.string(),
  affectedPages: z.array(z.string()).optional(),
});
export type LintResult = z.infer<typeof lintResultSchema>;
