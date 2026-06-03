import { z } from "zod";

// ─── Wiki Space ────────────────────────────────────────────────
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
  enabledPageTypes: z.array(z.string()).default([
    "entity",
    "concept",
    "source",
    "query",
    "comparison",
    "synthesis",
    "overview",
  ]),
  extraDirs: z.array(z.string()).default([]),
});
export type WikiSpaceSettings = z.infer<typeof wikiSpaceSettingsSchema>;

export const wikiSpaceCreateSchema = z.object({
  name: z.string().min(1).max(128),
  template: wikiTemplateSchema.default("general"),
  purpose: z.string().default(""),
  schema: z.string().default(""),
  settings: wikiSpaceSettingsSchema.default({
    language: "zh-CN",
    enabledPageTypes: [
      "entity",
      "concept",
      "source",
      "query",
      "comparison",
      "synthesis",
      "overview",
    ],
    extraDirs: [],
  }),
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

// ─── Wiki Page ─────────────────────────────────────────────────
export const wikiPageTypeSchema = z.enum([
  "entity",
  "concept",
  "source",
  "query",
  "comparison",
  "synthesis",
  "overview",
  "index",
]);
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

// ─── Wiki Source ───────────────────────────────────────────────
export const wikiSourceKindSchema = z.enum([
  "file",
  "text",
  "url",
  "clip",
  "generated",
]);
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

// ─── Wiki Link ─────────────────────────────────────────────────
export const wikiLinkStatusSchema = z.enum([
  "resolved",
  "missing",
  "ambiguous",
]);
export type WikiLinkStatus = z.infer<typeof wikiLinkStatusSchema>;

export const wikiLinkReadSchema = z.object({
  id: z.string(),
  space_id: z.string(),
  from_page_id: z.string(),
  to_page_id: z.string().nullable(),
  raw_target: z.string(),
  alias: z.string().nullable(),
  status: wikiLinkStatusSchema,
});
export type WikiLinkRead = z.infer<typeof wikiLinkReadSchema>;

// ─── Wiki Resolve ──────────────────────────────────────────────
export const wikiResolveQuery = z.object({
  target: z.string().min(1),
});
export type WikiResolveQuery = z.infer<typeof wikiResolveQuery>;

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
