import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";

// ─── Wiki Space ────────────────────────────────────────────────
export const wikiSpaces = sqliteTable(
  "wiki_spaces",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    name: text("name").notNull().default("My Wiki"),
    template: text("template").notNull().default("general"),
    purpose: text("purpose").notNull().default(""),
    schema: text("schema").notNull().default(""),
    settings: text("settings").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
    updatedAt: text("updated_at").notNull().default(sql`(current_timestamp)`),
  },
  (table) => ({
    updatedAtIdx: index("idx_wiki_spaces_updated_at").on(table.updatedAt),
  }),
);

// ─── Wiki Page ─────────────────────────────────────────────────
export const wikiPages = sqliteTable(
  "wiki_pages",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    spaceId: text("space_id")
      .notNull()
      .references(() => wikiSpaces.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    slug: text("slug").notNull(),
    type: text("type").notNull().default("concept"),
    title: text("title").notNull(),
    content: text("content").notNull().default(""),
    frontmatter: text("frontmatter").notNull().default("{}"),
    sources: text("sources").notNull().default("[]"),
    tags: text("tags").notNull().default("[]"),
    related: text("related").notNull().default("[]"),
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
    updatedAt: text("updated_at").notNull().default(sql`(current_timestamp)`),
  },
  (table) => ({
    spacePathUq: unique("uq_wiki_pages_space_path").on(table.spaceId, table.path),
    spaceSlugIdx: index("idx_wiki_pages_space_slug").on(table.spaceId, table.slug),
    spaceTypeIdx: index("idx_wiki_pages_space_type").on(table.spaceId, table.type),
    spaceUpdatedAtIdx: index("idx_wiki_pages_space_updated_at").on(
      table.spaceId,
      table.updatedAt,
    ),
    spacePathIdx: index("idx_wiki_pages_space_path").on(table.spaceId, table.path),
  }),
);

// ─── Wiki Page Revision ────────────────────────────────────────
export const wikiPageRevisions = sqliteTable(
  "wiki_page_revisions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    pageId: text("page_id")
      .notNull()
      .references(() => wikiPages.id, { onDelete: "cascade" }),
    jobId: text("job_id"),
    beforeContent: text("before_content"),
    afterContent: text("after_content").notNull(),
    reason: text("reason").notNull().default("manual_edit"),
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  },
  (table) => ({
    pageIdIdx: index("idx_wiki_page_revisions_page_id").on(table.pageId),
    jobIdIdx: index("idx_wiki_page_revisions_job_id").on(table.jobId),
  }),
);

// ─── Wiki Source ───────────────────────────────────────────────
export const wikiSources = sqliteTable(
  "wiki_sources",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    spaceId: text("space_id")
      .notNull()
      .references(() => wikiSpaces.id, { onDelete: "cascade" }),
    identity: text("identity").notNull(),
    title: text("title").notNull(),
    kind: text("kind").notNull().default("text"),
    originalName: text("original_name"),
    originalUri: text("original_uri"),
    storagePath: text("storage_path"),
    normalizedText: text("normalized_text").notNull().default(""),
    contentHash: text("content_hash"),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    status: text("status").notNull().default("new"),
    metadata: text("metadata").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
    updatedAt: text("updated_at").notNull().default(sql`(current_timestamp)`),
  },
  (table) => ({
    spaceIdentityUq: unique("uq_wiki_sources_space_identity").on(
      table.spaceId,
      table.identity,
    ),
    spaceContentHashIdx: index("idx_wiki_sources_space_content_hash").on(
      table.spaceId,
      table.contentHash,
    ),
    spaceStatusIdx: index("idx_wiki_sources_space_status").on(
      table.spaceId,
      table.status,
    ),
  }),
);

// ─── Wiki Source-Page Relation ─────────────────────────────────
export const wikiSourcePages = sqliteTable(
  "wiki_source_pages",
  {
    sourceId: text("source_id")
      .notNull()
      .references(() => wikiSources.id, { onDelete: "cascade" }),
    pageId: text("page_id")
      .notNull()
      .references(() => wikiPages.id, { onDelete: "cascade" }),
    jobId: text("job_id"),
    relation: text("relation").notNull().default("cited"),
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  },
  (table) => ({
    sourcePageUq: unique("uq_wiki_source_pages_source_page").on(
      table.sourceId,
      table.pageId,
    ),
    sourceIdIdx: index("idx_wiki_source_pages_source_id").on(table.sourceId),
    pageIdIdx: index("idx_wiki_source_pages_page_id").on(table.pageId),
  }),
);

// ─── Wiki Link ─────────────────────────────────────────────────
export const wikiLinks = sqliteTable(
  "wiki_links",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    spaceId: text("space_id")
      .notNull()
      .references(() => wikiSpaces.id, { onDelete: "cascade" }),
    fromPageId: text("from_page_id")
      .notNull()
      .references(() => wikiPages.id, { onDelete: "cascade" }),
    toPageId: text("to_page_id"),
    rawTarget: text("raw_target").notNull(),
    alias: text("alias"),
    status: text("status").notNull().default("missing"),
  },
  (table) => ({
    fromPageIdx: index("idx_wiki_links_from_page").on(table.fromPageId),
    toPageIdx: index("idx_wiki_links_to_page").on(table.toPageId),
    spaceIdx: index("idx_wiki_links_space").on(table.spaceId),
  }),
);

// ─── Wiki Ingest Job ───────────────────────────────────────────
export const wikiIngestJobs = sqliteTable(
  "wiki_ingest_jobs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    spaceId: text("space_id")
      .notNull()
      .references(() => wikiSpaces.id, { onDelete: "cascade" }),
    sourceId: text("source_id"),
    type: text("type").notNull().default("ingest"),
    status: text("status").notNull().default("queued"),
    stage: text("stage"),
    progressCurrent: integer("progress_current").default(0),
    progressTotal: integer("progress_total").default(0),
    attempt: integer("attempt").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    input: text("input").notNull().default("{}"),
    output: text("output").default("{}"),
    error: text("error"),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
    updatedAt: text("updated_at").notNull().default(sql`(current_timestamp)`),
  },
  (table) => ({
    spaceStatusIdx: index("idx_wiki_jobs_space_status").on(
      table.spaceId,
      table.status,
    ),
    spaceCreatedIdx: index("idx_wiki_jobs_space_created").on(
      table.spaceId,
      table.createdAt,
    ),
    sourceIdIdx: index("idx_wiki_jobs_source_id").on(table.sourceId),
  }),
);

// ─── Wiki Review Item ──────────────────────────────────────────
export const wikiReviewItems = sqliteTable(
  "wiki_review_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    spaceId: text("space_id")
      .notNull()
      .references(() => wikiSpaces.id, { onDelete: "cascade" }),
    sourceId: text("source_id"),
    pageId: text("page_id"),
    jobId: text("job_id"),
    type: text("type").notNull(),
    severity: text("severity").notNull().default("info"),
    status: text("status").notNull().default("open"),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    affectedPages: text("affected_pages").notNull().default("[]"),
    searchQueries: text("search_queries").notNull().default("[]"),
    options: text("options").notNull().default("[]"),
    resolvedAction: text("resolved_action"),
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
    resolvedAt: text("resolved_at"),
  },
  (table) => ({
    spaceStatusIdx: index("idx_wiki_review_space_status").on(
      table.spaceId,
      table.status,
    ),
    spaceCreatedIdx: index("idx_wiki_review_space_created").on(
      table.spaceId,
      table.createdAt,
    ),
  }),
);

// ─── Wiki Lint Run ─────────────────────────────────────────────
export const wikiLintRuns = sqliteTable(
  "wiki_lint_runs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    spaceId: text("space_id")
      .notNull()
      .references(() => wikiSpaces.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    status: text("status").notNull().default("running"),
    result: text("result").default("{}"),
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
    finishedAt: text("finished_at"),
  },
  (table) => ({
    spaceTypeIdx: index("idx_wiki_lint_runs_space_type").on(
      table.spaceId,
      table.type,
    ),
  }),
);

// ─── Wiki Lint Item ────────────────────────────────────────────
export const wikiLintItems = sqliteTable(
  "wiki_lint_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    runId: text("run_id")
      .notNull()
      .references(() => wikiLintRuns.id, { onDelete: "cascade" }),
    spaceId: text("space_id")
      .notNull()
      .references(() => wikiSpaces.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    severity: text("severity").notNull().default("warning"),
    pageId: text("page_id"),
    message: text("message").notNull(),
    details: text("details").default("{}"),
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  },
  (table) => ({
    runIdIdx: index("idx_wiki_lint_items_run_id").on(table.runId),
    spaceTypeIdx: index("idx_wiki_lint_items_space_type").on(
      table.spaceId,
      table.type,
    ),
  }),
);

// ─── Wiki Graph Insight Dismissal ──────────────────────────────
export const wikiGraphInsightDismissals = sqliteTable(
  "wiki_graph_insight_dismissals",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    spaceId: text("space_id")
      .notNull()
      .references(() => wikiSpaces.id, { onDelete: "cascade" }),
    insightKey: text("insight_key").notNull(),
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  },
  (table) => ({
    spaceInsightUq: unique("uq_wiki_insight_dismissals_space_key").on(
      table.spaceId,
      table.insightKey,
    ),
  }),
);

// ─── Types ─────────────────────────────────────────────────────
export type WikiSpaceRow = typeof wikiSpaces.$inferSelect;
export type WikiSpaceInsert = typeof wikiSpaces.$inferInsert;
export type WikiPageRow = typeof wikiPages.$inferSelect;
export type WikiPageInsert = typeof wikiPages.$inferInsert;
export type WikiPageRevisionRow = typeof wikiPageRevisions.$inferSelect;
export type WikiPageRevisionInsert = typeof wikiPageRevisions.$inferInsert;
export type WikiSourceRow = typeof wikiSources.$inferSelect;
export type WikiSourceInsert = typeof wikiSources.$inferInsert;
export type WikiSourcePageRow = typeof wikiSourcePages.$inferSelect;
export type WikiSourcePageInsert = typeof wikiSourcePages.$inferInsert;
export type WikiLinkRow = typeof wikiLinks.$inferSelect;
export type WikiLinkInsert = typeof wikiLinks.$inferInsert;
export type WikiIngestJobRow = typeof wikiIngestJobs.$inferSelect;
export type WikiIngestJobInsert = typeof wikiIngestJobs.$inferInsert;
export type WikiReviewItemRow = typeof wikiReviewItems.$inferSelect;
export type WikiReviewItemInsert = typeof wikiReviewItems.$inferInsert;
export type WikiLintRunRow = typeof wikiLintRuns.$inferSelect;
export type WikiLintRunInsert = typeof wikiLintRuns.$inferInsert;
export type WikiLintItemRow = typeof wikiLintItems.$inferSelect;
export type WikiLintItemInsert = typeof wikiLintItems.$inferInsert;
