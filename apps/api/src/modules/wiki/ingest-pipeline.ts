import fs from "node:fs";
import path from "node:path";
import { parseFileBlocks, isSafeIngestPath, sanitizeIngestedFileContent, parseFrontmatter, formatFrontmatter, buildPageContent, mergePageContent, getFileStem } from "@feedmind/wiki-core";
import { buildSystemPrompt, buildAnalysisPrompt, buildGenerationPrompt } from "./ingest-prompts.js";
import { addReviewItems } from "./review-service.js";
import type { ReviewItem } from "@feedmind/contracts";
import { spaceDir } from "./wiki-utils.js";

// ─── Config ──────────────────────────────────────────────────────

const MAX_SOURCE_CHARS = 80_000;

// ─── LLM Client ──────────────────────────────────────────────────

import { OpenAiLlmClient, type LlmClient } from "./llm-client.js";
import { getScenarioRuntime } from "../models/config-service.js";

// ─── Space Directory Helpers ─────────────────────────────────────
// spaceDir 从 wiki-utils.ts 导入（固定以项目根目录为基准）

function llmWikiDir(spaceId: string): string {
  return path.join(spaceDir(spaceId), ".llm-wiki");
}

function sourceFilePath(spaceId: string, identity: string): string {
  const fileName = identity.endsWith(".md") ? identity : `${identity}.md`;
  return path.join(spaceDir(spaceId), "raw", "sources", fileName);
}

// ─── Read Source Content ─────────────────────────────────────────

function readSourceContent(spaceId: string, sourceIdentity: string): {
  content: string;
  sourceStem: string;
} {
  const fPath = sourceFilePath(spaceId, sourceIdentity);
  if (!fs.existsSync(fPath)) {
    throw new Error(`Source file not found: ${fPath}`);
  }

  const raw = fs.readFileSync(fPath, "utf-8");
  const { frontmatter, body } = parseFrontmatter(raw);
  const stem = getFileStem(sourceIdentity);

  // Get metadata context from frontmatter
  const title = (frontmatter.title as string) || stem;
  const kind = (frontmatter.kind as string) || "text";

  // For text sources, use the body directly. Others will need format conversion (M5).
  let content = body.trim();
  if (!content) {
    content = raw.trim();
  }

  // Truncate very long content
  if (content.length > MAX_SOURCE_CHARS) {
    content = content.slice(0, MAX_SOURCE_CHARS) +
      `\n\n[... content truncated at ${MAX_SOURCE_CHARS} characters ...]`;
  }

  return {
    content: `# ${title}\n\n${content}\n\n(Source kind: ${kind})`,
    sourceStem: stem,
  };
}

// ─── Read Space Context ─────────────────────────────────────────

interface SpaceContext {
  purpose: string;
  schema: string;
  index: string;
  existingSlugs: string[];
}

function readSpaceContext(spaceId: string): SpaceContext {
  const sDir = spaceDir(spaceId);

  const purpose = readOptionalFile(path.join(sDir, "purpose.md"))
    || readOptionalFile(path.join(sDir, "space.json"))
    || "";

  const schema = readOptionalFile(path.join(sDir, "schema.md")) || "";

  // Collect existing wiki pages
  const wikiDir = path.join(sDir, "wiki");
  const existingSlugs: string[] = [];
  const pageLines: string[] = [];

  function collectPages(dir: string, category: string) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const mdFiles = entries
        .filter((e) => !e.isDirectory() && e.name.endsWith(".md"))
        .sort();

      for (const entry of mdFiles) {
        const slug = entry.name.replace(/\.md$/, "");
        if (slug === "index" || slug === "log" || slug === "overview") continue;

        const fullPath = path.join(dir, entry.name);
        try {
          const fileContent = fs.readFileSync(fullPath, "utf-8");
          const { frontmatter } = parseFrontmatter(fileContent);
          const title = (frontmatter.title as string) || slug;
          existingSlugs.push(slug);
          pageLines.push(`- [[${slug}|${title}]]`);
        } catch {
          existingSlugs.push(slug);
          pageLines.push(`- [[${slug}|${slug}]]`);
        }
      }
    } catch {
      // directory doesn't exist yet
    }
  }

  // Collect in order: entities, concepts, sources
  collectPages(path.join(wikiDir, "entities"), "entities");
  collectPages(path.join(wikiDir, "concepts"), "concepts");
  collectPages(path.join(wikiDir, "sources"), "sources");
  collectPages(wikiDir, "root");

  const index = pageLines.join("\n");

  return { purpose, schema, index, existingSlugs };
}

function readOptionalFile(filePath: string): string | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8").trim();
    // If reading space.json, extract purpose field
    if (filePath.endsWith("space.json")) {
      try {
        const parsed = JSON.parse(content);
        return (parsed.purpose as string) || null;
      } catch {
        return null;
      }
    }
    return content || null;
  } catch {
    return null;
  }
}

// ─── Stage 1: Analysis ───────────────────────────────────────────

interface AnalysisResult {
  keyEntities: Array<{ name: string; description: string; type: string }>;
  keyConcepts: Array<{ name: string; description: string; type: string }>;
  mainArguments: string[];
  connections: string[];
  reviewItems: Array<{
    type: "missing-page" | "duplicate" | "contradiction" | "suggestion";
    title: string;
    description: string;
  }>;
  summary: string;
}

async function stage1Analysis(
  sourceContent: string,
  context: SpaceContext,
  llmClient: LlmClient,
): Promise<AnalysisResult> {
  const systemPrompt = buildSystemPrompt(context.purpose, context.schema);
  const analysisPrompt = buildAnalysisPrompt(sourceContent, context.index);

  const raw = await llmClient.chat(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: analysisPrompt },
    ],
    { responseFormat: "json", maxTokens: 4096 },
  );

  // Parse JSON response with fallback
  try {
    const parsed = JSON.parse(raw);

    return {
      keyEntities: Array.isArray(parsed.keyEntities) ? parsed.keyEntities : [],
      keyConcepts: Array.isArray(parsed.keyConcepts) ? parsed.keyConcepts : [],
      mainArguments: Array.isArray(parsed.mainArguments) ? parsed.mainArguments : [],
      connections: Array.isArray(parsed.connections) ? parsed.connections : [],
      reviewItems: Array.isArray(parsed.reviewItems) ? parsed.reviewItems : [],
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
    };
  } catch (err) {
    throw new Error(
      `Failed to parse analysis JSON from LLM response: ${err instanceof Error ? err.message : String(err)}\nRaw: ${raw.slice(0, 300)}`,
    );
  }
}

// ─── Stage 2: Generation ─────────────────────────────────────────

async function stage2Generation(
  analysisJSON: string,
  context: SpaceContext,
  sourceIdentity: string,
  llmClient: LlmClient,
): Promise<string> {
  const systemPrompt = buildSystemPrompt(context.purpose, context.schema);
  const generationPrompt = buildGenerationPrompt(
    analysisJSON,
    context.existingSlugs,
    sourceIdentity,
  );

  return llmClient.chat(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: generationPrompt },
    ],
    { responseFormat: "text", maxTokens: 8192 },
  );
}

// ─── Process FILE Blocks ─────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s一-鿿-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    || "untitled";
}

function generateSourceSlug(sourceIdentity: string): string {
  const stem = sourceIdentity.endsWith(".md")
    ? sourceIdentity.slice(0, -3)
    : sourceIdentity;
  return `source-${slugify(stem)}`;
}

interface ProcessBlocksResult {
  created: string[];
  updated: string[];
}

function processFileBlocks(
  spaceId: string,
  blocks: Array<{ path: string; content: string }>,
  sourceFileName: string,
): ProcessBlocksResult {
  const created: string[] = [];
  const updated: string[] = [];
  const sDir = spaceDir(spaceId);

  for (const block of blocks) {
    const safePath = sanitizeIngestedFileContent(block.path);

    if (!isSafeIngestPath(safePath)) {
      continue;
    }

    const absPath = path.join(sDir, safePath);
    const dirName = path.dirname(absPath);
    fs.mkdirSync(dirName, { recursive: true });

    const sanitizedContent = sanitizeIngestedFileContent(block.content);

    if (fs.existsSync(absPath)) {
      // Merge with existing page
      const existingContent = fs.readFileSync(absPath, "utf-8");
      const merged = mergePageContent(existingContent, sanitizedContent, sourceFileName);
      fs.writeFileSync(absPath, merged, "utf-8");
      updated.push(safePath);
    } else {
      // New page — ensure frontmatter exists
      let finalContent = sanitizedContent;
      if (!finalContent.startsWith("---")) {
        const slug = path.basename(safePath, ".md");
        const { frontmatter } = parseFrontmatter(sanitizedContent);
        const type = (frontmatter.type as string) || inferTypeFromBlockPath(safePath);
        const title = (frontmatter.title as string) || slug;
        finalContent = buildPageContent({
          type,
          title,
          tags: (frontmatter.tags as string[]) ?? [],
          sources: (frontmatter.sources as string[]) ?? [sourceFileName],
          related: (frontmatter.related as string[]) ?? [],
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          content: finalContent,
        });
      }
      fs.writeFileSync(absPath, finalContent, "utf-8");
      created.push(safePath);
    }
  }

  return { created, updated };
}

function inferTypeFromBlockPath(relPath: string): string {
  const normalized = relPath.replace(/\\/g, "/").toLowerCase();
  if (normalized.includes("/entities/")) return "entity";
  if (normalized.includes("/concepts/")) return "concept";
  if (normalized.includes("/sources/")) return "source";
  if (normalized.endsWith("/overview.md")) return "overview";
  return "concept";
}

// ─── Update Index ────────────────────────────────────────────────

function updateIndex(spaceId: string, newPages: Array<{ path: string; title: string; type: string }>): void {
  if (newPages.length === 0) return;

  const indexPath = path.join(spaceDir(spaceId), "wiki", "index.md");

  let content = "";
  if (fs.existsSync(indexPath)) {
    content = fs.readFileSync(indexPath, "utf-8");
  }

  if (!content.trim()) {
    content = "# Page Index\n\nAuto-managed index of all wiki pages.\n\n";
  }

  // Group new pages by type
  const byType = new Map<string, Array<{ path: string; title: string }>>();
  for (const page of newPages) {
    const t = page.type || "concept";
    const list = byType.get(t) ?? [];
    list.push({ path: page.path, title: page.title });
    byType.set(t, list);
  }

  // Append new entries under type headers
  let additions = "";
  for (const [type, pages] of byType) {
    additions += `\n### ${type}\n`;
    for (const page of pages) {
      const slug = page.path.replace(/^wiki\//, "").replace(/\.md$/, "");
      additions += `- [[${slug}|${page.title}]]\n`;
    }
  }

  if (additions) {
    fs.writeFileSync(indexPath, content + additions, "utf-8");
  }
}

// ─── Update Log ──────────────────────────────────────────────────

function updateLog(spaceId: string, entry: string): void {
  const logPath = path.join(spaceDir(spaceId), "wiki", "log.md");

  let content = "";
  if (fs.existsSync(logPath)) {
    content = fs.readFileSync(logPath, "utf-8");
  }

  if (!content.trim()) {
    content = "# Change Log\n\n";
  }

  const now = new Date().toISOString().replace("T", " ").slice(0, 16);
  content += `- ${now}: ${entry}\n`;

  fs.writeFileSync(logPath, content, "utf-8");
}

// ─── Update Overview ─────────────────────────────────────────────

function updateOverview(spaceId: string, newSummary: string): void {
  if (!newSummary) return;

  const overviewPath = path.join(spaceDir(spaceId), "wiki", "overview.md");

  let existingFrontmatter: Record<string, unknown> = {};
  let existingBody = "";
  if (fs.existsSync(overviewPath)) {
    const raw = fs.readFileSync(overviewPath, "utf-8");
    const { frontmatter, body } = parseFrontmatter(raw);
    existingFrontmatter = frontmatter;
    existingBody = body.trim();
  }

  // Preserve existing frontmatter fields, only override known ones
  const fm = {
    ...existingFrontmatter,
    type: "overview",
    title: "Wiki Overview",
    updated: new Date().toISOString().slice(0, 10),
  };
  const combined = formatFrontmatter(fm) + `\n\n${newSummary}\n\n---\n\n${existingBody}`;

  fs.writeFileSync(overviewPath, combined, "utf-8");
}

// ─── Save Review Items ───────────────────────────────────────────

interface ReviewItemInput {
  type: "missing-page" | "duplicate" | "contradiction" | "suggestion";
  title: string;
  description: string;
}

async function createAndSaveReviewItems(
  spaceId: string,
  items: ReviewItemInput[],
  sourceIdentity: string,
): Promise<number> {
  if (!items || items.length === 0) return 0;

  const reviewItems: ReviewItem[] = items.map((item) => ({
    id: `review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: item.type,
    title: item.title,
    description: item.description,
    sourcePath: sourceIdentity,
    affectedPages: [],
    searchQueries: [],
    options: [
      { label: "Approve", action: "Approve" },
      { label: "Skip", action: "Skip" },
    ],
    resolved: false,
    createdAt: Date.now(),
  }));

  await addReviewItems(spaceId, reviewItems);
  return reviewItems.length;
}

// ─── Extract Source Identity from Context ───────────────────────

export function extractIdentity(sourcePath: string): string {
  const normalized = sourcePath.replace(/\\/g, "/");
  const parts = normalized.split("/");
  const last = parts[parts.length - 1] || normalized;
  return last;
}

// ─── Main Ingest Orchestrator ────────────────────────────────────

export type IngestProgressCallback = (message: string, step: number, totalSteps: number) => void;

export interface IngestResult {
  pagesCreated: number;
  pagesUpdated: number;
  reviewItemsCreated: number;
  warnings: string[];
  log: string[];
}

const TOTAL_STEPS = 5;

export async function runIngest(
  spaceId: string,
  sourcePath: string,
  onProgress?: IngestProgressCallback,
): Promise<IngestResult> {
  const log: string[] = [];
  const warnings: string[] = [];

  function addLog(msg: string) {
    log.push(msg);
  }

  function reportProgress(message: string, step: number) {
    addLog(message);
    onProgress?.(message, step, TOTAL_STEPS);
  }

  // Resolve wiki runtime config & create LLM client
  const runtime = await getScenarioRuntime("wiki");
  const llmClient: LlmClient = new OpenAiLlmClient({
    apiKey: runtime.api_key,
    baseUrl: runtime.base_url,
    model: runtime.model_name,
  });
  addLog(`Wiki LLM: ${runtime.model_name}`);

  // Step 1: Read source content
  const sourceIdentity = extractIdentity(sourcePath);
  let sourceContent: string;
  let sourceStem: string;
  try {
    const result = readSourceContent(spaceId, sourceIdentity);
    sourceContent = result.content;
    sourceStem = result.sourceStem;
    reportProgress(`读取源文件: ${sourceIdentity} (${sourceContent.length} 字符)`, 1);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to read source: ${msg}`);
  }

  // 2. Read space context
  const context = readSpaceContext(spaceId);
  addLog(`Space context: ${context.existingSlugs.length} existing pages`);

  // Step 3: Analysis
  reportProgress("正在分析内容...", 2);
  let analysis: AnalysisResult;
  try {
    analysis = await stage1Analysis(sourceContent, context, llmClient);
    addLog(
      `Analysis complete: ${analysis.keyEntities.length} entities, ` +
      `${analysis.keyConcepts.length} concepts, ` +
      `${analysis.reviewItems.length} review items`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Stage 1 (Analysis) failed: ${msg}`);
  }

  // Step 4: Generation
  reportProgress("正在生成 Wiki 页面...", 3);
  let generationText: string;
  try {
    generationText = await stage2Generation(
      JSON.stringify(analysis, null, 2),
      context,
      sourceIdentity,
      llmClient,
    );
    addLog(`Generation complete (${generationText.length} chars)`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Stage 2 (Generation) failed: ${msg}`);
  }

  // Parse FILE blocks
  const { blocks, warnings: parseWarnings } = parseFileBlocks(generationText);
  for (const w of parseWarnings) {
    warnings.push(w);
    addLog(`Warning: ${w}`);
  }
  addLog(`Parsed ${blocks.length} FILE blocks`);

  if (blocks.length === 0) {
    warnings.push("No valid FILE blocks generated by LLM");
    addLog("Warning: No valid FILE blocks generated");
    return { pagesCreated: 0, pagesUpdated: 0, reviewItemsCreated: 0, warnings, log };
  }

  // Step 5: Write pages
  reportProgress("正在写入页面...", 4);
  const { created, updated } = processFileBlocks(spaceId, blocks, sourceIdentity);
  addLog(`Written: ${created.length} created, ${updated.length} updated`);

  // Update index.md
  const newPageEntries = [...created, ...updated].map((p) => ({
    path: p,
    title: path.basename(p, ".md"),
    type: inferTypeFromBlockPath(p),
  }));
  updateIndex(spaceId, newPageEntries);

  // Update log.md
  updateLog(
    spaceId,
    `Ingested "${sourceIdentity}": ${created.length} pages created, ${updated.length} updated`,
  );

  // Update overview.md with source summary
  if (analysis.summary) {
    updateOverview(spaceId, analysis.summary);
  }

  // Save review items
  let reviewItemsCreated = 0;
  if (analysis.reviewItems.length > 0) {
    reviewItemsCreated = await createAndSaveReviewItems(
      spaceId,
      analysis.reviewItems,
      sourceIdentity,
    );
    addLog(`Saved ${reviewItemsCreated} review items`);
  }

  reportProgress("导入完成", 5);

  return {
    pagesCreated: created.length,
    pagesUpdated: updated.length,
    reviewItemsCreated,
    warnings,
    log,
  };
}


