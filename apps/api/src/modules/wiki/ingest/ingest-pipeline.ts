import fs from "node:fs";
import path from "node:path";
import {
  buildConceptContent,
  buildHandleTable,
  checkCache,
  computeRetractAction,
  conceptIdFromPath,
  decodeHandleLinks,
  dumpCache,
  extractSources,
  extractString,
  formatConceptLink,
  formatFrontmatter,
  isSystemWikiPath,
  loadCache,
  mergeConceptContent,
  normalizeConceptPath,
  parseFrontmatter,
  removeFromCache,
  resolveDedupTargets,
  resolveHandlePath,
  saveCache,
} from "@feedmind/wiki-core";
import type {
  ConceptHandle,
  DedupTarget,
  ExistingPageMeta,
  IngestCacheEntry,
} from "@feedmind/wiki-core";
import { WIKI_CONCEPT_TYPES } from "@feedmind/contracts";
import { buildAnalysisPrompt, buildGenerationPrompt, buildSystemPrompt } from "./ingest-prompts.js";
import { sourceChunkChars, splitSourceContent } from "./source-chunking.js";
import {
  getWikiDir,
  getSpaceDir,
  ensureDir,
  ensureRuntimeDir,
  nowISO,
  readDirRecursive,
  sha256,
  safeUnlink,
  safeWriteFile,
  isSystemFile,
} from "../space-fs/index.js";
import { appendOkfLog, rebuildOkfIndexes } from "../store/okf-ops.js";
import { logger } from "../../../lib/logger.js";
import { AiSdkLlmClient, type LlmClient } from "./llm-client.js";
import { resolveModelClient } from "../../models/model-cache.js";
import { parseTokenCount } from "../../models/parse-token-count.js";
import { getRuntimeConfig } from "../../runtime-config/config-service.js";

// 每空间串行链：同一空间的导入排队执行，并发时后到的等待前一个完成后才开始，而不是直接报错
const spaceQueues = new Map<string, Promise<void>>();
// OKF v0.2 生成者标识（actor 约定：agent/tool），写入每个概念的 generated.by
const INGEST_ACTOR = "feedmind/ingest";

interface SpaceContext {
  purpose: string;
  schema: string;
  index: string;
  existingPages: ExistingPageMeta[];
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
  // 拦截转换失败或解析中的占位源，避免 LLM 基于空正文脑补假概念
  const bodyText = body.trim() || raw.trim();
  const failedPlaceholder = /^\[(文档转换失败|提取失败|File too large)/.test(bodyText);
  const status = extractString(frontmatter, "status");
  if (status === "failed" || failedPlaceholder || status === "queued") {
    throw new Error(
      status === "queued"
        ? `源文件解析中，无法导入: ${sourceIdentity}`
        : `源文件格式转换失败，无法导入: ${sourceIdentity}`,
    );
  }
  const title =
    extractString(frontmatter, "title") ?? path.basename(sourceIdentity).replace(/\.md$/i, "");
  const kind = extractString(frontmatter, "kind") ?? "text";
  const content = body.trim() || raw.trim();
  const formatted = `# ${title}\n\n${content}\n\n（来源类型：${kind}）`;
  return { content: formatted, hash: sha256(formatted) };
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
  budget: { systemPrompt: string; maxSourceChars: number },
  shouldCancel?: () => boolean,
): Promise<AnalysisResult> {
  const chunks = splitSourceContent(sourceContent, budget.maxSourceChars);
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
    analyses[index] = await stage1Analysis(chunks[index]!, context, llmClient, budget.systemPrompt);
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
  const pages: ExistingPageMeta[] = [];
  const files = readDirRecursive(
    wikiDir,
    (_filePath, name) => name.toLowerCase().endsWith(".md") && !isSystemFile(name),
  );

  for (const filePath of files) {
    const relativePath = path.relative(wikiDir, filePath).replace(/\\/g, "/");
    const { frontmatter } = parseFrontmatter(fs.readFileSync(filePath, "utf-8"));
    const conceptId = conceptIdFromPath(relativePath);
    pages.push({
      id: conceptId,
      title: extractString(frontmatter, "title") ?? conceptId,
      description: extractString(frontmatter, "description") ?? "",
      type: extractString(frontmatter, "type") ?? "Reference",
    });
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
    existingPages: pages,
  };
}

function parseJsonSafe<T = unknown>(raw: string): T {
  // 1. 剔除思考模型（如 DeepSeek-R1 / Qwen 等）输出的思维链
  const textWithoutThink = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  // 2. 优先提取 Markdown 代码围栏内的 JSON 文本
  const fenceMatch = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(textWithoutThink);
  const candidate = fenceMatch ? fenceMatch[1]!.trim() : textWithoutThink;

  // 3. 尝试直接解析
  try {
    return JSON.parse(candidate) as T;
  } catch {
    // 4. 容错兜底：尝试截取最外层的 { ... } 或 [ ... ] 边界
    const startObj = candidate.indexOf("{");
    const endObj = candidate.lastIndexOf("}");
    if (startObj !== -1 && endObj > startObj) {
      try {
        return JSON.parse(candidate.slice(startObj, endObj + 1)) as T;
      } catch {
        // 忽略并尝试数组
      }
    }

    const startArr = candidate.indexOf("[");
    const endArr = candidate.lastIndexOf("]");
    if (startArr !== -1 && endArr > startArr) {
      try {
        return JSON.parse(candidate.slice(startArr, endArr + 1)) as T;
      } catch {
        // 忽略
      }
    }

    throw new Error(`无法从 LLM 响应中解析出合法 JSON: ${candidate.slice(0, 200)}...`);
  }
}

async function stage1Analysis(
  sourceContent: string,
  context: SpaceContext,
  llmClient: LlmClient,
  systemPrompt: string,
): Promise<AnalysisResult> {
  const raw = await llmClient.chat(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: buildAnalysisPrompt(sourceContent, context.index) },
    ],
    { responseFormat: "json" },
  );

  try {
    const parsed = parseJsonSafe<Record<string, unknown>>(raw);
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
  _context: SpaceContext,
  sourceIdentity: string,
  llmClient: LlmClient,
  handleTable: ConceptHandle[],
  mergeHints: string[],
  systemPrompt: string,
): Promise<string> {
  return llmClient.chat(
    [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: buildGenerationPrompt({
          analysis,
          sourceIdentity,
          handleTable,
          mergeHints,
        }),
      },
    ],
    { responseFormat: "json" },
  );
}

function parseGeneratedDocuments(raw: string, handleTable: ConceptHandle[]): GeneratedDocument[] {
  const parsed = parseJsonSafe<{ documents?: unknown }>(raw);
  if (!Array.isArray(parsed.documents)) throw new Error("LLM 未返回 documents 数组");

  const results: GeneratedDocument[] = [];
  for (let index = 0; index < parsed.documents.length; index++) {
    const item = parsed.documents[index];
    // 单个文档损坏即整体失败：静默跳过会让知识包缺页而导入仍报成功
    if (!item || typeof item !== "object") throw new Error(`第 ${index + 1} 个 Concept 不是对象`);
    const document = item as Record<string, unknown>;
    // 先解句柄再校验路径：模型可输出 "ref-1" 或 "ref-1.md"，normalizeConceptPath 只接受真实 .md 路径
    const rawPath = String(document["path"] ?? "");
    const documentPath = normalizeConceptPath(resolveHandlePath(rawPath, handleTable));
    const frontmatter = document["frontmatter"];
    if (!frontmatter || typeof frontmatter !== "object" || Array.isArray(frontmatter)) {
      throw new Error(`Concept ${documentPath} 缺少 frontmatter 对象`);
    }
    const content = document["content"];
    if (typeof content !== "string") throw new Error(`Concept ${documentPath} 缺少 content`);
    results.push({
      path: documentPath,
      frontmatter: frontmatter as Record<string, unknown>,
      content: decodeHandleLinks(content, handleTable),
    });
  }
  return results;
}

function normalizeGeneratedContent(document: GeneratedDocument, sourceIdentity: string): string {
  const frontmatter = { ...document.frontmatter };
  const rawType = extractString(frontmatter, "type");
  if (!rawType) throw new Error(`Concept ${document.path} 缺少非空 type`);
  // LLM 输出非法 type 直接失败：静默回退会把失控枚举当知识写入
  if (!(WIKI_CONCEPT_TYPES as readonly string[]).includes(rawType)) {
    throw new Error(`Concept ${document.path} 的 type 不在受控枚举内: ${rawType}`);
  }
  const type = rawType;

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

/** 把 resolveDedupTargets 结果渲染成 generation prompt 的指导行。 */
function renderMergeHints(targets: DedupTarget[], handleTable: ConceptHandle[]): string[] {
  const handleOf = (id: string) => handleTable.find((h) => h.id === id)?.ref ?? id;
  return targets.map((t) => {
    if (t.boundId) {
      return `- "${t.name}" → update existing ${handleOf(t.boundId)} (${t.boundId}). Do NOT create a new concept for it.`;
    }
    if (t.candidates.length > 0) {
      const list = t.candidates.map((c) => `${handleOf(c.id)} (${c.id})`).join(", ");
      return `- "${t.name}" → possible match: ${list}. Update the best match if same thing; otherwise create new.`;
    }
    return `- "${t.name}" → no close match. Create a new concept.`;
  });
}

/**
 * 源内容变更时先撤回上次导入产物：仅本 source 贡献的文件删除（留 history），
 * 多源页只剥 source。系统文件不碰。
 */
function retractPreviousIngest(
  spaceId: string,
  sourceIdentity: string,
  previousFiles: string[],
): { removed: number; updated: number } {
  const wikiDir = getWikiDir(spaceId);
  let removed = 0;
  let updated = 0;

  for (const rel of previousFiles) {
    if (isSystemWikiPath(rel)) continue;
    const filePath = path.join(wikiDir, rel);
    if (!fs.existsSync(filePath)) continue;

    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const { frontmatter, body } = parseFrontmatter(content);
      const action = computeRetractAction(extractSources(frontmatter), sourceIdentity);

      if (action.kind === "skip") continue;
      if (action.kind === "delete") {
        writePageHistory(spaceId, rel, content);
        safeUnlink(filePath);
        removed++;
        continue;
      }
      frontmatter["sources"] = action.sources;
      safeWriteFile(filePath, formatFrontmatter(frontmatter) + "\n" + body);
      updated++;
    } catch {
      // 单文件失败不阻塞整次 retract
    }
  }
  return { removed, updated };
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
  // 等待该空间上一个导入完成，确保队列串行推进
  const tail = (spaceQueues.get(spaceId) ?? Promise.resolve()).catch(() => {});
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

    // 源内容变更：先撤回上次导入产物，避免孤儿残留与 body 膨胀（replace-not-append）
    const previous = cache.get(sourceIdentity);
    if (previous && previous.sourceHash !== source.hash) {
      report("源文件已变更，正在撤回上次导入产物...", 1);
      const { removed, updated } = retractPreviousIngest(
        spaceId,
        sourceIdentity,
        previous.filesWritten,
      );
      logger.info({ spaceId, sourceIdentity, removed, updated }, "撤回上次导入产物完成");
      log.push(`已撤回上次导入：删除 ${removed} 个概念，更新 ${updated} 个概念。`);
      removeFromCache(cache, sourceIdentity);
      writeIngestCache(spaceId, cache);
    }

    const runtime = await getRuntimeConfig("wiki");
    const resolved = await resolveModelClient(Number(runtime.llm_id));
    // 与 chat 共用模型解析与 max_tokens 语义：输出上限取模型配置的真实 max_output（与 chat 同源），
    // 未配置时不传 max_tokens 交端点默认。不可写死小值：思考模型（DeepSeek V4）推理与正文共享该预算，
    // 推理吃满后正文为空，上层报“LLM 未返回内容”
    const maxTokens = parseTokenCount(resolved.maxOutput);
    const llmClient: LlmClient = new AiSdkLlmClient(resolved.client, resolved.modelApiId, {
      ...(maxTokens !== undefined ? { maxTokens } : {}),
      thinkingByDefault: resolved.thinkingByDefault,
      // 采样参数取 runtime 配置（与 chat 同源），不再在代码里写死
      temperature: runtime.temperature,
      topP: runtime.top_p,
    });
    logger.info(
      { model: runtime.model_id || runtime.model_name, maxTokens: maxTokens ?? null },
      "开始执行 OKF 知识库导入",
    );

    // 注意：retract 后 context 必须重读，existingPages 不能含已删除文件
    const context = readSpaceContext(spaceId);
    log.push(`OKF bundle 当前包含 ${context.existingPages.length} 个 Concept`);

    // 系统提示词与本轮分块预算都只算一次：提示词层级 = 空间 purpose/schema → runtime 补充 → OKF 硬规则
    const systemPrompt = buildSystemPrompt(context.purpose, context.schema, runtime.system_prompt);
    const maxSourceChars = sourceChunkChars({
      contextTokens: parseTokenCount(resolved.contextWindow) ?? null,
      outputTokens: maxTokens ?? null,
      promptChars: systemPrompt.length + context.index.length,
    });

    const analysis = await analyzeSource(
      source.content,
      source.hash,
      sourceIdentity,
      spaceId,
      context,
      llmClient,
      report,
      { systemPrompt, maxSourceChars },
      shouldCancel,
    );

    ensureNotCancelled(shouldCancel);
    report("正在生成 OKF Concept...", 3);
    const handleTable = buildHandleTable(context.existingPages);
    const dedupTargets = resolveDedupTargets(
      [
        ...analysis.keyEntities.map((e) => ({ name: e.name })),
        ...analysis.keyConcepts.map((c) => ({ name: c.name })),
      ],
      context.existingPages,
    );
    const mergeHints = renderMergeHints(dedupTargets, handleTable);
    const generated = await stage2Generation(
      JSON.stringify(analysis, null, 2),
      context,
      sourceIdentity,
      llmClient,
      handleTable,
      mergeHints,
      systemPrompt,
    );

    let documents: GeneratedDocument[];
    try {
      documents = parseGeneratedDocuments(generated, handleTable);
    } catch (err) {
      throw new Error(
        `OKF Concept JSON 解析失败: ${err instanceof Error ? err.message : String(err)}`,
        {
          cause: err,
        },
      );
    }
    if (documents.length === 0) {
      // 区分“源内容为空”与“LLM 生成失败”，记录告警避免静默吞掉异常结果
      logger.warn({ spaceId, sourceIdentity }, "大模型未提取出有效概念页面，导入结果为空");
      warnings.push("大模型未生成有效的 OKF 概念页面");
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
    rebuildOkfIndexes(spaceId);
    appendOkfLog(
      spaceId,
      `已导入“${sourceIdentity}”：创建 ${created.length} 个概念，更新 ${updated.length} 个概念。`,
    );

    const writtenFiles = [...conceptFiles, "wiki/index.md", "wiki/log.md"];
    saveCache(cache, sourceIdentity, source.hash, writtenFiles);
    writeIngestCache(spaceId, cache);

    report("OKF 导入完成", 5);
    logger.info(
      { spaceId, pagesCreated: created.length, pagesUpdated: updated.length },
      "OKF 概念页面导入完成",
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
