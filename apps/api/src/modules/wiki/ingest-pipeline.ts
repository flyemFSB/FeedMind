import fs from "node:fs";
import path from "node:path";
import {
  buildConceptContent,
  checkCache,
  conceptIdFromPath,
  dumpCache,
  extractSources,
  extractString,
  formatConceptLink,
  loadCache,
  mergeConceptContent,
  normalizeConceptPath,
  parseFrontmatter,
  removeFromCache,
  saveCache,
} from "@feedmind/wiki-core";
import type { IngestCacheEntry } from "@feedmind/wiki-core";
import { WIKI_CONCEPT_TYPES } from "@feedmind/contracts";
import { buildAnalysisPrompt, buildGenerationPrompt, buildSystemPrompt } from "./ingest-prompts.js";
import {
  getWikiDir,
  getSpaceDir,
  ensureDir,
  ensureRuntimeDir,
  nowISO,
  readDirRecursive,
  sha256,
  safeWriteFile,
  isSystemFile,
} from "./space-fs/index.js";
import { appendOkfLog, rebuildOkfIndexes } from "./okf-ops.js";
import { logger } from "../../lib/logger.js";
import { OpenAiLlmClient, type LlmClient } from "./llm-client.js";
import { getRuntimeConfig } from "../models/config-service.js";

const MAX_SOURCE_CHARS = 80_000;
// 每空间串行链：同一空间的导入排队执行，并发时后到的等待前一个完成后才开始，而不是直接报错
const spaceQueues = new Map<string, Promise<void>>();
// OKF v0.2 生成者标识（actor 约定：agent/tool），写入每个概念的 generated.by
const INGEST_ACTOR = "feedmind/ingest";

interface SpaceContext {
  purpose: string;
  schema: string;
  index: string;
  existingConceptIds: string[];
}

interface AnalysisResult {
  keyEntities: Array<{ name: string; description: string; type: string }>;
  keyConcepts: Array<{ name: string; description: string; type: string }>;
  mainArguments: string[];
  connections: string[];
  summary: string;
}

interface GeneratedDocument {
  path: string;
  frontmatter: Record<string, unknown>;
  content: string;
}

function sourceFilePath(spaceId: string, identity: string): string {
  const fileName = identity.toLowerCase().endsWith(".md") ? identity : `${identity}.md`;
  return path.join(getSpaceDir(spaceId), "raw", "sources", fileName);
}

function readSourceDocument(
  spaceId: string,
  sourceIdentity: string,
): { content: string; hash: string } {
  const filePath = sourceFilePath(spaceId, sourceIdentity);
  if (!fs.existsSync(filePath)) throw new Error(`源文件未找到: ${filePath}`);

  const raw = fs.readFileSync(filePath, "utf-8");
  const { frontmatter, body } = parseFrontmatter(raw);
  const title =
    extractString(frontmatter, "title") ?? path.basename(sourceIdentity).replace(/\.md$/i, "");
  const kind = extractString(frontmatter, "kind") ?? "text";
  const content = body.trim() || raw.trim();
  const formatted = `# ${title}\n\n${content}\n\n（来源类型：${kind}）`;
  return { content: formatted, hash: sha256(formatted) };
}

function splitSourceContent(content: string): string[] {
  if (content.length <= MAX_SOURCE_CHARS) return [content];

  const chunks: string[] = [];
  let start = 0;
  while (start < content.length) {
    let end = Math.min(start + MAX_SOURCE_CHARS, content.length);
    if (end < content.length) {
      const boundary = content.lastIndexOf("\n\n", end);
      if (boundary > start + 1_000) end = boundary;
    }
    chunks.push(content.slice(start, end).trim());
    start = end;
  }
  return chunks.filter(Boolean);
}

function checkpointPath(spaceId: string, sourceIdentity: string): string {
  return path.join(
    getSpaceDir(spaceId),
    ".feedmind",
    "ingest-progress",
    `${sha256(sourceIdentity).slice(0, 16)}.json`,
  );
}

function mergeAnalyses(analyses: AnalysisResult[]): AnalysisResult {
  const uniqueBy = <T extends { name: string }>(items: T[]): T[] =>
    items.filter((item, index) => items.findIndex((other) => other.name === item.name) === index);

  return {
    keyEntities: uniqueBy(analyses.flatMap((analysis) => analysis.keyEntities)),
    keyConcepts: uniqueBy(analyses.flatMap((analysis) => analysis.keyConcepts)),
    mainArguments: [...new Set(analyses.flatMap((analysis) => analysis.mainArguments))],
    connections: [...new Set(analyses.flatMap((analysis) => analysis.connections))],
    summary: analyses
      .map((analysis) => analysis.summary)
      .filter(Boolean)
      .join("\n\n"),
  };
}

async function analyzeSource(
  sourceContent: string,
  sourceHash: string,
  sourceIdentity: string,
  spaceId: string,
  context: SpaceContext,
  llmClient: LlmClient,
  report: (message: string, step: number) => void,
  shouldCancel?: () => boolean,
): Promise<AnalysisResult> {
  const chunks = splitSourceContent(sourceContent);
  const pathName = checkpointPath(spaceId, sourceIdentity);
  let analyses: AnalysisResult[] = [];

  try {
    if (fs.existsSync(pathName)) {
      const checkpoint = JSON.parse(fs.readFileSync(pathName, "utf-8")) as {
        sourceHash?: string;
        analyses?: AnalysisResult[];
      };
      if (checkpoint.sourceHash === sourceHash && Array.isArray(checkpoint.analyses)) {
        analyses = checkpoint.analyses;
      }
    }
  } catch {
    analyses = [];
  }

  for (let index = analyses.length; index < chunks.length; index++) {
    if (shouldCancel?.()) throw new IngestCancelledError();
    analyses[index] = await stage1Analysis(chunks[index]!, context, llmClient);
    ensureDir(path.dirname(pathName));
    safeWriteFile(pathName, JSON.stringify({ sourceHash, analyses }, null, 2));
    report(`正在分析源内容（${index + 1}/${chunks.length}）...`, 2);
  }

  if (fs.existsSync(pathName)) fs.unlinkSync(pathName);
  return mergeAnalyses(analyses);
}

function cachePath(spaceId: string): string {
  return path.join(getSpaceDir(spaceId), ".feedmind", "ingest-cache.json");
}

function readIngestCache(spaceId: string): Map<string, IngestCacheEntry> {
  const filePath = cachePath(spaceId);
  return fs.existsSync(filePath) ? loadCache(fs.readFileSync(filePath, "utf-8")) : new Map();
}

function writeIngestCache(spaceId: string, cache: Map<string, IngestCacheEntry>): void {
  ensureRuntimeDir(spaceId);
  safeWriteFile(cachePath(spaceId), dumpCache(cache));
}

export function removeIngestCache(spaceId: string, sourceIdentity: string): void {
  const cache = readIngestCache(spaceId);
  removeFromCache(cache, sourceIdentity);
  if (sourceIdentity.toLowerCase().endsWith(".md")) {
    removeFromCache(cache, sourceIdentity.slice(0, -3));
  } else {
    removeFromCache(cache, `${sourceIdentity}.md`);
  }
  writeIngestCache(spaceId, cache);
}

function allCachedFilesExist(spaceId: string, files: string[]): boolean {
  return (
    files.length > 0 && files.every((file) => fs.existsSync(path.join(getSpaceDir(spaceId), file)))
  );
}

export class IngestCancelledError extends Error {
  constructor() {
    super("导入任务已取消");
    this.name = "IngestCancelledError";
  }
}

function ensureNotCancelled(shouldCancel?: () => boolean): void {
  if (shouldCancel?.()) throw new IngestCancelledError();
}

function readSpaceContext(spaceId: string): SpaceContext {
  const spaceDir = getSpaceDir(spaceId);
  const wikiDir = getWikiDir(spaceId);
  const pages: Array<{ id: string; title: string; description: string }> = [];
  const files = readDirRecursive(
    wikiDir,
    (_filePath, name) => name.toLowerCase().endsWith(".md") && !isSystemFile(name),
  );

  for (const filePath of files) {
    try {
      const relativePath = path.relative(wikiDir, filePath).replace(/\\/g, "/");
      const { frontmatter } = parseFrontmatter(fs.readFileSync(filePath, "utf-8"));
      const conceptId = conceptIdFromPath(relativePath);
      pages.push({
        id: conceptId,
        title: extractString(frontmatter, "title") ?? conceptId,
        description: extractString(frontmatter, "description") ?? "",
      });
    } catch {
      /* 无法读取的 Concept 由 OKF lint 报告。 */
    }
  }

  pages.sort((a, b) => a.id.localeCompare(b.id));
  const index = pages
    .map(({ id, title, description }) => `- ${formatConceptLink(title, id)} - ${description}`)
    .join("\n");

  let metadata: Record<string, unknown> = {};
  try {
    metadata = JSON.parse(fs.readFileSync(path.join(spaceDir, "space.json"), "utf-8")) as Record<
      string,
      unknown
    >;
  } catch {
    // 空间元数据缺失时使用默认上下文。
  }

  return {
    purpose: typeof metadata["purpose"] === "string" ? metadata["purpose"] : "",
    schema: typeof metadata["schema"] === "string" ? metadata["schema"] : "",
    index,
    existingConceptIds: pages.map((page) => page.id),
  };
}

async function stage1Analysis(
  sourceContent: string,
  context: SpaceContext,
  llmClient: LlmClient,
): Promise<AnalysisResult> {
  const raw = await llmClient.chat(
    [
      { role: "system", content: buildSystemPrompt(context.purpose, context.schema) },
      { role: "user", content: buildAnalysisPrompt(sourceContent, context.index) },
    ],
    { responseFormat: "json" },
  );

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      keyEntities: Array.isArray(parsed["keyEntities"])
        ? (parsed["keyEntities"] as AnalysisResult["keyEntities"])
        : [],
      keyConcepts: Array.isArray(parsed["keyConcepts"])
        ? (parsed["keyConcepts"] as AnalysisResult["keyConcepts"])
        : [],
      mainArguments: Array.isArray(parsed["mainArguments"])
        ? parsed["mainArguments"].map(String)
        : [],
      connections: Array.isArray(parsed["connections"]) ? parsed["connections"].map(String) : [],
      summary: typeof parsed["summary"] === "string" ? parsed["summary"] : "",
    };
  } catch (err) {
    throw new Error(
      `LLM 响应的分析 JSON 解析失败: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
}

async function stage2Generation(
  analysis: string,
  context: SpaceContext,
  sourceIdentity: string,
  llmClient: LlmClient,
): Promise<string> {
  return llmClient.chat(
    [
      { role: "system", content: buildSystemPrompt(context.purpose, context.schema) },
      {
        role: "user",
        content: buildGenerationPrompt(analysis, context.existingConceptIds, sourceIdentity),
      },
    ],
    { responseFormat: "json", maxTokens: 8192 },
  );
}

function parseGeneratedDocuments(raw: string, warnings: string[]): GeneratedDocument[] {
  const normalized = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  const parsed = JSON.parse(normalized) as { documents?: unknown };
  if (!Array.isArray(parsed.documents)) throw new Error("LLM 未返回 documents 数组");

  const results: GeneratedDocument[] = [];
  for (let index = 0; index < parsed.documents.length; index++) {
    const item = parsed.documents[index];
    try {
      if (!item || typeof item !== "object") throw new Error(`第 ${index + 1} 个 Concept 不是对象`);
      const document = item as Record<string, unknown>;
      const documentPath = normalizeConceptPath(String(document["path"] ?? ""));
      const frontmatter = document["frontmatter"];
      if (!frontmatter || typeof frontmatter !== "object" || Array.isArray(frontmatter)) {
        throw new Error(`Concept ${documentPath} 缺少 frontmatter 对象`);
      }
      const content = document["content"];
      if (typeof content !== "string") throw new Error(`Concept ${documentPath} 缺少 content`);
      results.push({
        path: documentPath,
        frontmatter: frontmatter as Record<string, unknown>,
        content,
      });
    } catch (err) {
      // 单个文档解析失败不应中止整个导入，记录警告并跳过
      warnings.push(
        `跳过第 ${index + 1} 个 Concept: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return results;
}

function normalizeGeneratedContent(document: GeneratedDocument, sourceIdentity: string): string {
  const frontmatter = { ...document.frontmatter };
  const rawType = extractString(frontmatter, "type");
  if (!rawType) throw new Error(`Concept ${document.path} 缺少非空 type`);
  // LLM 可能不严格遵守受控枚举，落盘前规约到枚举，未知值回退到 Concept 兜底
  const type = (WIKI_CONCEPT_TYPES as readonly string[]).includes(rawType) ? rawType : "Concept";

  // 保证 primary source 记录在 sources 里；extractSources 已按 resource 去重并吸收遗留 provenance
  const sources = extractSources(frontmatter);
  if (!sources.some((s) => s.resource === sourceIdentity)) {
    sources.push({ resource: sourceIdentity });
  }
  frontmatter["sources"] = sources;
  frontmatter["generated"] = { by: INGEST_ACTOR, at: nowISO() };
  delete frontmatter["provenance"];
  delete frontmatter["timestamp"];
  return buildConceptContent({ type, frontmatter, content: document.content });
}

function processDocuments(
  spaceId: string,
  documents: GeneratedDocument[],
  sourceIdentity: string,
  shouldCancel?: () => boolean,
): { created: string[]; updated: string[]; writtenFiles: string[] } {
  const wikiDir = getWikiDir(spaceId);
  const created: string[] = [];
  const updated: string[] = [];
  const writtenFiles: string[] = [];

  for (const document of documents) {
    ensureNotCancelled(shouldCancel);
    const filePath = path.join(wikiDir, document.path);
    const normalized = normalizeGeneratedContent(document, sourceIdentity);
    ensureParent(filePath);

    if (fs.existsSync(filePath)) {
      const existing = fs.readFileSync(filePath, "utf-8");
      writePageHistory(spaceId, document.path, existing);
      const merged = mergeConceptContent(existing, normalized);
      safeWriteFile(filePath, merged);
      updated.push(document.path);
    } else {
      safeWriteFile(filePath, normalized);
      created.push(document.path);
    }
    writtenFiles.push(path.relative(getSpaceDir(spaceId), filePath).replace(/\\/g, "/"));
  }

  return { created, updated, writtenFiles };
}

function writePageHistory(spaceId: string, documentPath: string, content: string): void {
  const historyPath = path.join(
    getSpaceDir(spaceId),
    ".feedmind",
    "page-history",
    `${documentPath.replace(/[\\/]/g, "_")}.${Date.now()}.md`,
  );
  ensureDir(path.dirname(historyPath));
  safeWriteFile(historyPath, content);
}

function ensureParent(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function updateOverview(spaceId: string, summary: string): string | null {
  if (!summary) return null;
  const filePath = path.join(getWikiDir(spaceId), "overview.md");
  let body = summary;
  let existingFrontmatter: Record<string, unknown> = {};
  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, "utf-8");
    writePageHistory(spaceId, "overview.md", existing);
    const parsed = parseFrontmatter(existing);
    existingFrontmatter = parsed.frontmatter;
    body = `${summary}\n\n---\n\n${parsed.body.trim()}`;
  }
  ensureParent(filePath);
  safeWriteFile(
    filePath,
    buildConceptContent({
      type: "Overview",
      title: "Knowledge Bundle Overview",
      description: summary,
      generated: { by: INGEST_ACTOR, at: nowISO() },
      frontmatter: existingFrontmatter,
      content: body,
    }),
  );
  return path.relative(getSpaceDir(spaceId), filePath).replace(/\\/g, "/");
}

export function extractIdentity(sourcePath: string): string {
  const normalized = sourcePath.replace(/\\/g, "/");
  return normalized.split("/").at(-1) ?? normalized;
}

export type IngestProgressCallback = (message: string, step: number, totalSteps: number) => void;

export interface IngestResult {
  pagesCreated: number;
  pagesUpdated: number;
  warnings: string[];
  log: string[];
  writtenFiles: string[];
}

const TOTAL_STEPS = 5;

export async function runIngest(
  spaceId: string,
  sourcePath: string,
  onProgress?: IngestProgressCallback,
  shouldCancel?: () => boolean,
): Promise<IngestResult> {
  // 排队：先等该空间上一个导入完成，再执行本次导入
  const tail = spaceQueues.get(spaceId) ?? Promise.resolve();
  const { promise: gate, resolve: finish } = Promise.withResolvers<void>();
  spaceQueues.set(spaceId, gate);
  await tail;

  const log: string[] = [];
  const warnings: string[] = [];
  const report = (message: string, step: number) => {
    log.push(message);
    onProgress?.(message, step, TOTAL_STEPS);
  };

  try {
    const sourceIdentity = extractIdentity(sourcePath);
    report(`读取源文件：${sourceIdentity}`, 1);
    const source = readSourceDocument(spaceId, sourceIdentity);
    const cache = readIngestCache(spaceId);
    const cachedFiles = checkCache(cache, sourceIdentity, source.hash);
    if (cachedFiles && allCachedFilesExist(spaceId, cachedFiles)) {
      report("源文件未变化，使用已有导入结果。", 5);
      return { pagesCreated: 0, pagesUpdated: 0, warnings: [], log, writtenFiles: cachedFiles };
    }

    const runtime = await getRuntimeConfig("wiki");
    const llmClient: LlmClient = new OpenAiLlmClient({
      apiKey: runtime.api_key,
      baseUrl: runtime.base_url,
      model: runtime.model_id || runtime.model_name,
    });
    logger.info({ model: runtime.model_id || runtime.model_name }, "OKF 导入开始");

    const context = readSpaceContext(spaceId);
    log.push(`OKF bundle 当前包含 ${context.existingConceptIds.length} 个 Concept`);

    const analysis = await analyzeSource(
      source.content,
      source.hash,
      sourceIdentity,
      spaceId,
      context,
      llmClient,
      report,
      shouldCancel,
    );

    ensureNotCancelled(shouldCancel);
    report("正在生成 OKF Concept...", 3);
    const generated = await stage2Generation(
      JSON.stringify(analysis, null, 2),
      context,
      sourceIdentity,
      llmClient,
    );

    let documents: GeneratedDocument[];
    try {
      documents = parseGeneratedDocuments(generated, warnings);
    } catch (err) {
      throw new Error(
        `OKF Concept JSON 解析失败: ${err instanceof Error ? err.message : String(err)}`,
        {
          cause: err,
        },
      );
    }
    if (documents.length === 0) {
      // 与"源内容本就为空"区分：这是 LLM 生成失败，落 warn 而非静默当成功空结果
      logger.warn({ spaceId, sourceIdentity }, "LLM 未生成 OKF Concept，导入空结果");
      warnings.push("LLM 未生成 OKF Concept");
      return { pagesCreated: 0, pagesUpdated: 0, warnings, log, writtenFiles: [] };
    }

    ensureNotCancelled(shouldCancel);
    report("正在写入 OKF 文件...", 4);
    const {
      created,
      updated,
      writtenFiles: conceptFiles,
    } = processDocuments(spaceId, documents, sourceIdentity, shouldCancel);
    ensureNotCancelled(shouldCancel);
    const overviewFile = updateOverview(spaceId, analysis.summary);
    rebuildOkfIndexes(spaceId);
    appendOkfLog(
      spaceId,
      `已导入“${sourceIdentity}”：创建 ${created.length} 个概念，更新 ${updated.length} 个概念。`,
    );

    const writtenFiles = [
      ...conceptFiles,
      ...(overviewFile ? [overviewFile] : []),
      "wiki/index.md",
      "wiki/log.md",
    ];
    saveCache(cache, sourceIdentity, source.hash, writtenFiles);
    writeIngestCache(spaceId, cache);

    report("OKF 导入完成", 5);
    logger.info(
      { spaceId, pagesCreated: created.length, pagesUpdated: updated.length },
      "OKF 导入完成",
    );
    return {
      pagesCreated: created.length,
      pagesUpdated: updated.length,
      warnings,
      log,
      writtenFiles,
    };
  } finally {
    finish();
  }
}
