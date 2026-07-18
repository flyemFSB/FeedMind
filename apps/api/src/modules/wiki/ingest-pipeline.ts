import fs from "node:fs";
import path from "node:path";
import {
  parseFileBlocks,
  isSafeIngestPath,
  sanitizeIngestedFileContent,
  parseFrontmatter,
  formatFrontmatter,
  buildPageContent,
  mergePageContent,
  getFileStem,
} from "@feedmind/wiki-core";
import { buildSystemPrompt, buildAnalysisPrompt, buildGenerationPrompt } from "./ingest-prompts.js";
import { getSpaceDir, isSystemFile } from "./space-fs/index.js";
import { logger } from "../../lib/logger.js";

// ─── 配置 ──────────────────────────────────────────────────────

const MAX_SOURCE_CHARS = 80_000;

// ─── LLM 客户端 ──────────────────────────────────────────────────

import { OpenAiLlmClient, type LlmClient } from "./llm-client.js";
import { getRuntimeConfig } from "../models/config-service.js";

// ─── 空间目录辅助函数 ─────────────────────────────────────────────

function sourceFilePath(spaceId: string, identity: string): string {
  const fileName = identity.endsWith(".md") ? identity : `${identity}.md`;
  return path.join(getSpaceDir(spaceId), "raw", "sources", fileName);
}

// ─── 读取源内容 ───────────────────────────────────────────────────

function readSourceContent(
  spaceId: string,
  sourceIdentity: string,
): {
  content: string;
  sourceStem: string;
} {
  const fPath = sourceFilePath(spaceId, sourceIdentity);
  if (!fs.existsSync(fPath)) {
    throw new Error(`源文件未找到: ${fPath}`);
  }

  const raw = fs.readFileSync(fPath, "utf-8");
  const { frontmatter, body } = parseFrontmatter(raw);
  const stem = getFileStem(sourceIdentity);

  // 从 frontmatter 读取元数据上下文
  const title = (frontmatter.title as string) || stem;
  const kind = (frontmatter.kind as string) || "text";

  // 文本类源直接用 body；其他格式需等 M5 做格式转换
  let content = body.trim();
  if (!content) {
    content = raw.trim();
  }

  // 截断超长内容
  if (content.length > MAX_SOURCE_CHARS) {
    content =
      content.slice(0, MAX_SOURCE_CHARS) + `\n\n[... 内容在 ${MAX_SOURCE_CHARS} 字符处截断 ...]`;
  }

  return {
    content: `# ${title}\n\n${content}\n\n(Source kind: ${kind})`,
    sourceStem: stem,
  };
}

// ─── 读取空间上下文 ───────────────────────────────────────────────

interface SpaceContext {
  purpose: string;
  schema: string;
  index: string;
  existingSlugs: string[];
}

function readSpaceContext(spaceId: string): SpaceContext {
  const sDir = getSpaceDir(spaceId);

  const purpose =
    readOptionalFile(path.join(sDir, "purpose.md")) ||
    readOptionalFile(path.join(sDir, "space.json")) ||
    "";

  const schema = readOptionalFile(path.join(sDir, "schema.md")) || "";

  // 遍历已有 Wiki 页面
  const wikiDir = path.join(sDir, "wiki");
  const existingSlugs: string[] = [];
  const pageLines: string[] = [];

  function collectPages(dir: string, _category: string) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const mdFiles = entries.filter((e) => !e.isDirectory() && e.name.endsWith(".md")).sort();

      for (const entry of mdFiles) {
        const slug = entry.name.replace(/\.md$/, "");
        if (isSystemFile(entry.name)) continue;

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
      // 目录尚不存在
    }
  }

  // 按 entities → concepts → sources 顺序收集，保证 index 排版一致
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
    // 若读取 space.json，提取 purpose 字段
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

// ─── 阶段一：分析 ─────────────────────────────────────────────────

interface AnalysisResult {
  keyEntities: Array<{ name: string; description: string; type: string }>;
  keyConcepts: Array<{ name: string; description: string; type: string }>;
  mainArguments: string[];
  connections: string[];
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
    { responseFormat: "json" },
  );

  try {
    const parsed = JSON.parse(raw);

    return {
      keyEntities: Array.isArray(parsed.keyEntities) ? parsed.keyEntities : [],
      keyConcepts: Array.isArray(parsed.keyConcepts) ? parsed.keyConcepts : [],
      mainArguments: Array.isArray(parsed.mainArguments) ? parsed.mainArguments : [],
      connections: Array.isArray(parsed.connections) ? parsed.connections : [],
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
    };
  } catch (err) {
    throw new Error(
      `LLM 响应的分析 JSON 解析失败: ${err instanceof Error ? err.message : String(err)}\nRaw: ${raw.slice(0, 300)}`,
      { cause: err },
    );
  }
}

// ─── 阶段二：生成 ─────────────────────────────────────────────────

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

  // stage2 生成阶段需要更多 token 空间以输出完整的 Wiki 页面内容
  return llmClient.chat(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: generationPrompt },
    ],
    { responseFormat: "text", maxTokens: 8192 },
  );
}

// ─── 处理 FILE 块 ─────────────────────────────────────────────────

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
  const sDir = getSpaceDir(spaceId);

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
      // 合并已有页面内容
      const existingContent = fs.readFileSync(absPath, "utf-8");
      const merged = mergePageContent(existingContent, sanitizedContent, sourceFileName);
      fs.writeFileSync(absPath, merged, "utf-8");
      updated.push(safePath);
    } else {
      // 新建页面——确保有 frontmatter
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

// ─── 更新索引 ─────────────────────────────────────────────────────

function updateIndex(
  spaceId: string,
  newPages: Array<{ path: string; title: string; type: string }>,
): void {
  if (newPages.length === 0) return;

  const indexPath = path.join(getSpaceDir(spaceId), "wiki", "index.md");

  let content = "";
  if (fs.existsSync(indexPath)) {
    content = fs.readFileSync(indexPath, "utf-8");
  }

  if (!content.trim()) {
    content = "# Page Index\n\nWiki 页面索引（自动维护）。\n\n";
  }

  // 按类型分组新页面
  const byType = new Map<string, Array<{ path: string; title: string }>>();
  for (const page of newPages) {
    const t = page.type || "concept";
    const list = byType.get(t) ?? [];
    list.push({ path: page.path, title: page.title });
    byType.set(t, list);
  }

  // 在类型标题下追加新条目
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

// ─── 更新变更日志 ─────────────────────────────────────────────────

function updateLog(spaceId: string, entry: string): void {
  const logPath = path.join(getSpaceDir(spaceId), "wiki", "log.md");

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

// ─── 更新概览页 ───────────────────────────────────────────────────

function updateOverview(spaceId: string, newSummary: string): void {
  if (!newSummary) return;

  const overviewPath = path.join(getSpaceDir(spaceId), "wiki", "overview.md");

  let existingFrontmatter: Record<string, unknown> = {};
  let existingBody = "";
  if (fs.existsSync(overviewPath)) {
    const raw = fs.readFileSync(overviewPath, "utf-8");
    const { frontmatter, body } = parseFrontmatter(raw);
    existingFrontmatter = frontmatter;
    existingBody = body.trim();
  }

  // 保留现有 frontmatter 字段，仅覆写已知字段
  const fm = {
    ...existingFrontmatter,
    type: "overview",
    title: "Wiki Overview",
    updated: new Date().toISOString().slice(0, 10),
  };
  const combined = formatFrontmatter(fm) + `\n\n${newSummary}\n\n---\n\n${existingBody}`;

  fs.writeFileSync(overviewPath, combined, "utf-8");
}

// ─── 从上下文提取源标识 ────────────────────────────────────────────

export function extractIdentity(sourcePath: string): string {
  const normalized = sourcePath.replace(/\\/g, "/");
  const parts = normalized.split("/");
  const last = parts[parts.length - 1] || normalized;
  return last;
}

// ─── 主导入编排 ───────────────────────────────────────────────────

export type IngestProgressCallback = (message: string, step: number, totalSteps: number) => void;

export interface IngestResult {
  pagesCreated: number;
  pagesUpdated: number;
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

  // 解析 Wiki 运行配置并创建 LLM 客户端
  const runtime = await getRuntimeConfig("wiki");
  const llmClient: LlmClient = new OpenAiLlmClient({
    apiKey: runtime.api_key,
    baseUrl: runtime.base_url,
    model: runtime.model_id || runtime.model_name,
  });
  addLog(`Wiki LLM: ${runtime.model_id || runtime.model_name}`);
  logger.info({ model: runtime.model_id || runtime.model_name }, "Wiki 导入开始");

  // 步骤 1：读取源内容
  const sourceIdentity = extractIdentity(sourcePath);
  let sourceContent: string;
  try {
    const result = readSourceContent(spaceId, sourceIdentity);
    sourceContent = result.content;
    reportProgress(`读取源文件: ${sourceIdentity} (${sourceContent.length} 字符)`, 1);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`读取源文件失败: ${msg}`, { cause: err });
  }

  // 步骤 2：读取空间上下文
  const context = readSpaceContext(spaceId);
  addLog(`空间上下文: ${context.existingSlugs.length} 个已有页面`);

  // 步骤 3：分析
  reportProgress("正在分析内容...", 2);
  let analysis: AnalysisResult;
  try {
    analysis = await stage1Analysis(sourceContent, context, llmClient);
    addLog(
      `分析完成: ${analysis.keyEntities.length} 个实体, ${analysis.keyConcepts.length} 个概念`,
    );
    logger.info({ spaceId, entityCount: analysis.keyEntities.length }, "阶段一分析完成");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`阶段一（分析）失败: ${msg}`, { cause: err });
  }

  // 步骤 4：生成
  reportProgress("正在生成 Wiki 页面...", 3);
  let generationText: string;
  try {
    generationText = await stage2Generation(
      JSON.stringify(analysis, null, 2),
      context,
      sourceIdentity,
      llmClient,
    );
    addLog(`阶段二生成完成 (${generationText.length} 字符)`);
    logger.info({ spaceId, charCount: generationText.length }, "阶段二生成完成");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`阶段二（生成）失败: ${msg}`, { cause: err });
  }

  // 解析 FILE 块
  const { blocks, warnings: parseWarnings } = parseFileBlocks(generationText);
  for (const w of parseWarnings) {
    warnings.push(w);
    addLog(`警告: ${w}`);
  }
  addLog(`解析到 ${blocks.length} 个 FILE 块`);

  if (blocks.length === 0) {
    warnings.push("LLM 未生成有效的 FILE 块");
    addLog("警告: LLM 未生成有效的 FILE 块");
    return { pagesCreated: 0, pagesUpdated: 0, warnings, log };
  }

  // 步骤 5：写入页面
  reportProgress("正在写入页面...", 4);
  const { created, updated } = processFileBlocks(spaceId, blocks, sourceIdentity);
  addLog(`写入完成: ${created.length} 个新建, ${updated.length} 个更新`);

  // 更新 index.md
  const newPageEntries = [...created, ...updated].map((p) => ({
    path: p,
    title: path.basename(p, ".md"),
    type: inferTypeFromBlockPath(p),
  }));
  updateIndex(spaceId, newPageEntries);

  // 更新 log.md
  updateLog(
    spaceId,
    `已导入 "${sourceIdentity}": ${created.length} 个页面新建, ${updated.length} 个更新`,
  );

  // 用源摘要更新 overview.md
  if (analysis.summary) {
    updateOverview(spaceId, analysis.summary);
  }

  reportProgress("导入完成", 5);
  logger.info(
    { spaceId, pagesCreated: created.length, pagesUpdated: updated.length },
    "Wiki 导入完成",
  );

  return {
    pagesCreated: created.length,
    pagesUpdated: updated.length,
    warnings,
    log,
  };
}
