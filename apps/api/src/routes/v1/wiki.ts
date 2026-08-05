import fs from "node:fs";
import path from "node:path";
import { extractDocument, formatFrontmatter } from "@feedmind/wiki-core";

import { Hono } from "hono";
import {
  wikiPageCreateSchema,
  wikiPageUpdateSchema,
  wikiSourceCreateSchema,
  wikiSpaceCreateSchema,
  wikiSpaceUpdateSchema,
} from "@feedmind/contracts";
import { z } from "zod";
import { jsonOk, jsonError, parseJson } from "../../lib/http.js";

// 集中导入 Wiki 模块
import {
  listWikiSpaces,
  getWikiSpace,
  createWikiSpace,
  updateWikiSpace,
  deleteWikiSpace,
} from "../../modules/wiki/index.js";
import {
  listWikiPages,
  getWikiPage,
  createWikiPage,
  updateWikiPage,
  deleteWikiPage,
  resolveWikiLink,
  getWikiBacklinks,
} from "../../modules/wiki/page-store.js";
import {
  listWikiSources,
  getWikiSource,
  createWikiSource,
  deleteWikiSource,
  previewDeleteImpact,
  buildSourceFrontmatter,
  markSourceIngested,
} from "../../modules/wiki/source-store.js";
import { getWikiGraph, getWikiGraphInsights } from "../../modules/wiki/graph-service.js";
import { searchWiki } from "../../modules/wiki/search-service.js";
import {
  listIngestJobs,
  enqueueIngest,
  markIngestJobProcessing,
  cancelIngestJob,
  retryIngestJob,
  completeIngestJob,
  failIngestJob,
} from "../../modules/wiki/job-service.js";
import { runIngest } from "../../modules/wiki/ingest-pipeline.js";
import { wakeIngestWorker } from "../../modules/wiki/ingest-worker.js";
import { runLint, getLintItems } from "../../modules/wiki/lint-service.js";
import {
  ensureDir,
  getWikiRootDir,
  readSourceTitle,
  safeUnlink,
  safeWriteFile,
  validateSpaceId,
  sha256,
} from "../../modules/wiki/space-fs/index.js";

const sourcePathSchema = z
  .string()
  .min(1)
  .max(512)
  .refine((v) => !v.includes("..") && !v.startsWith("/") && !v.startsWith("\\"), {
    message: "sourcePath 包含非法路径字符",
  });

const ingestBodySchema = z.object({
  sourcePath: sourcePathSchema,
});

/** 上传成功后自动入队导入任务并唤醒 worker，无需等 30s 轮询。入队失败不阻塞上传。 */
function autoIngestUpload(spaceId: string, sourcePath: string, sourceTitle: string): void {
  void enqueueIngest(spaceId, sourcePath, undefined, sourceTitle)
    .then(() => {
      wakeIngestWorker();
    })
    .catch(() => {
      // 入队失败仅提示，不阻塞上传
    });
}

const searchBodySchema = z.object({
  query: z.string().default(""),
  topK: z.number().int().min(1).max(50).default(20),
});

function sanitizeFileName(name: string): string {
  const normalized = name.replace(/\\/g, "/");
  const parts = normalized.split("/");
  const base = parts[parts.length - 1] ?? name;
  return (
    base
      .replace(/[^a-zA-Z0-9一-鿿._-]/g, "")
      .replace(/^\.+/, "")
      .replace(/\.{2,}/g, ".") || "untitled"
  );
}

function slugFromName(name: string): string {
  const stem = name.includes(".") ? name.slice(0, name.lastIndexOf(".")) : name;
  return (
    stem
      .toLowerCase()
      .replace(/[^a-z0-9一-鿿-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "untitled"
  );
}

export const wikiRoutes = new Hono();

// ─── 空间 ──────────────────────────────────────────────────────
wikiRoutes.get("/wiki/spaces", async (c) => jsonOk(c, await listWikiSpaces()));
wikiRoutes.post("/wiki/spaces", async (c) => {
  const payload = await parseJson(c, wikiSpaceCreateSchema);
  return jsonOk(c, await createWikiSpace(payload), 201);
});
wikiRoutes.get("/wiki/spaces/:spaceId", async (c) =>
  jsonOk(c, await getWikiSpace(c.req.param("spaceId"))),
);
wikiRoutes.patch("/wiki/spaces/:spaceId", async (c) => {
  const payload = await parseJson(c, wikiSpaceUpdateSchema);
  return jsonOk(c, await updateWikiSpace(c.req.param("spaceId"), payload));
});
wikiRoutes.delete("/wiki/spaces/:spaceId", async (c) => {
  return jsonOk(c, await deleteWikiSpace(c.req.param("spaceId")));
});

// ─── 页面 ───────────────────────────────────────────────────────
wikiRoutes.get("/wiki/spaces/:spaceId/pages", async (c) => {
  const spaceId = c.req.param("spaceId");
  const type = c.req.query("type");
  const q = c.req.query("q");
  const limit = Math.max(1, Math.min(200, Number(c.req.query("limit")) || 50));
  const offset = Math.max(0, Number(c.req.query("offset")) || 0);
  return jsonOk(c, await listWikiPages(spaceId, { type, q, limit, offset }));
});
wikiRoutes.post("/wiki/spaces/:spaceId/pages", async (c) => {
  const spaceId = c.req.param("spaceId");
  const payload = await parseJson(c, wikiPageCreateSchema);
  return jsonOk(c, await createWikiPage(spaceId, payload), 201);
});
wikiRoutes.get("/wiki/spaces/:spaceId/pages/resolve", async (c) => {
  const spaceId = c.req.param("spaceId");
  const target = c.req.query("target");
  if (!target)
    return jsonOk(c, {
      resolved: false,
      page_id: null,
      slug: null,
      title: null,
      status: "missing",
      candidates: [],
    });
  return jsonOk(c, await resolveWikiLink(spaceId, target));
});
wikiRoutes.get("/wiki/spaces/:spaceId/pages/:pageId{.+}/backlinks", async (c) => {
  const spaceId = c.req.param("spaceId");
  const pageId = c.req.param("pageId");
  return jsonOk(c, await getWikiBacklinks(spaceId, pageId));
});
wikiRoutes.get("/wiki/spaces/:spaceId/pages/:pageId{.+}", async (c) =>
  jsonOk(c, await getWikiPage(c.req.param("spaceId"), c.req.param("pageId"))),
);
wikiRoutes.put("/wiki/spaces/:spaceId/pages/:pageId{.+}", async (c) => {
  const spaceId = c.req.param("spaceId");
  const pageId = c.req.param("pageId");
  const payload = await parseJson(c, wikiPageUpdateSchema);
  return jsonOk(c, await updateWikiPage(spaceId, pageId, payload));
});
wikiRoutes.delete("/wiki/spaces/:spaceId/pages/:pageId{.+}", async (c) => {
  await deleteWikiPage(c.req.param("spaceId"), c.req.param("pageId"));
  return jsonOk(c, { success: true });
});

// ─── 源文件 ────────────────────────────────────────────────────
wikiRoutes.get("/wiki/spaces/:spaceId/sources", async (c) => {
  const spaceId = c.req.param("spaceId");
  const status = c.req.query("status");
  const limit = Math.max(1, Math.min(200, Number(c.req.query("limit")) || 50));
  const offset = Math.max(0, Number(c.req.query("offset")) || 0);
  return jsonOk(c, await listWikiSources(spaceId, { status, limit, offset }));
});
wikiRoutes.post("/wiki/spaces/:spaceId/sources/text", async (c) => {
  const spaceId = c.req.param("spaceId");
  const payload = await parseJson(c, wikiSourceCreateSchema);
  return jsonOk(c, await createWikiSource(spaceId, payload), 201);
});
wikiRoutes.post("/wiki/spaces/:spaceId/sources/files", async (c) => {
  const spaceId = c.req.param("spaceId");
  validateSpaceId(spaceId);
  const contentType = c.req.header("Content-Type") ?? "";

  if (!contentType.includes("multipart/form-data")) {
    return jsonError(c, 400, "VALIDATION_ERROR", "Content-Type 必须为 multipart/form-data");
  }

  const formData = await c.req.parseBody();
  const file = formData["file"];
  if (!file || !(file instanceof File)) {
    return jsonError(c, 400, "VALIDATION_ERROR", "缺少 file 字段");
  }

  const byteArray = new Uint8Array(await file.arrayBuffer());
  const safeName = sanitizeFileName(file.name);
  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  if (byteArray.length > MAX_FILE_SIZE) {
    return jsonError(c, 413, "HTTP_ERROR", `文件大小超过 10MB 限制: ${safeName}`);
  }
  const ext = safeName.includes(".") ? (safeName.split(".").pop()?.toLowerCase() ?? "") : "";
  const slug = slugFromName(safeName);
  const sourceFileName = `${slug}.md`;

  const wikiRoot = getWikiRootDir();
  const sourcesDir = path.join(wikiRoot, spaceId, "raw", "sources");
  ensureDir(sourcesDir);

  const now = new Date().toISOString();
  const textExts = new Set([
    "md",
    "txt",
    "html",
    "htm",
    "csv",
    "json",
    "yaml",
    "yml",
    "xml",
    "rtf",
  ]);
  const binaryExts = new Set(["pdf", "doc", "docx", "pptx", "xlsx", "xls", "odt", "odp", "ods"]);
  const imageExts = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg"]);

  if (textExts.has(ext)) {
    const decoder = new TextDecoder("utf-8", { fatal: false });
    const text = decoder.decode(byteArray);
    const fm = buildSourceFrontmatter(safeName, "file", now, {
      resource: safeName,
      original_name: safeName,
      original_uri: safeName,
      mime_type: ext === "md" ? "text/markdown" : `text/${ext}`,
      size_bytes: byteArray.length,
      import_ext: ext,
    });
    safeWriteFile(path.join(sourcesDir, sourceFileName), formatFrontmatter(fm) + "\n" + text);
    autoIngestUpload(spaceId, sourceFileName, safeName);
    const stat = fs.statSync(path.join(sourcesDir, sourceFileName));
    return jsonOk(
      c,
      {
        id: slug,
        space_id: spaceId,
        identity: sourceFileName,
        title: safeName,
        kind: "file",
        original_name: safeName,
        original_uri: safeName,
        storage_path: `raw/sources/${sourceFileName}`,
        mime_type: ext === "md" ? "text/markdown" : `text/${ext}`,
        size_bytes: stat.size,
        content_hash: sha256(text),
        status: "ready",
        metadata: { import_ext: ext },
        page_count: 0,
        created_at: now,
        updated_at: now,
      },
      201,
    );
  }

  if (binaryExts.has(ext)) {
    // 保存临时文件 → 提取文本 → 仅保留 .md
    const binPath = path.join(sourcesDir, safeName);
    fs.writeFileSync(binPath, Buffer.from(byteArray));

    let extractedText: string;
    let docMime = "application/octet-stream";

    let warnings: string[] = [];
    try {
      const doc = await extractDocument(binPath, safeName);
      extractedText = doc.text;
      docMime = doc.mimeType;
      warnings = doc.warnings;
    } catch (err) {
      extractedText = `[提取失败: ${err instanceof Error ? err.message : String(err)}]`;
    } finally {
      // 无论提取成功与否，都清理临时二进制文件
      safeUnlink(binPath);
    }

    const fm = buildSourceFrontmatter(safeName, "file", now, {
      resource: safeName,
      original_name: safeName,
      original_uri: safeName,
      mime_type: docMime,
      size_bytes: byteArray.length,
      status: "ready",
      import_ext: ext,
    });
    safeWriteFile(
      path.join(sourcesDir, sourceFileName),
      formatFrontmatter(fm) + "\n" + extractedText,
    );
    autoIngestUpload(spaceId, sourceFileName, safeName);
    const stat = fs.statSync(path.join(sourcesDir, sourceFileName));
    return jsonOk(
      c,
      {
        id: slug,
        space_id: spaceId,
        identity: sourceFileName,
        title: safeName,
        kind: "file",
        original_name: safeName,
        original_uri: safeName,
        storage_path: `raw/sources/${sourceFileName}`,
        mime_type: docMime,
        size_bytes: stat.size,
        content_hash: sha256(extractedText),
        status: "ready",
        metadata: { import_ext: ext, extract_warnings: warnings },
        page_count: 0,
        created_at: now,
        updated_at: now,
      },
      201,
    );
  }

  if (imageExts.has(ext)) {
    // 图片保存到 raw/assets/，同时在 sources 创建引用 .md
    const assetsDir = path.join(wikiRoot, spaceId, "raw", "assets");
    ensureDir(assetsDir);
    const assetPath = path.join(assetsDir, safeName);
    fs.writeFileSync(assetPath, Buffer.from(byteArray));

    const imageMimeMap: Record<string, string> = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
      svg: "image/svg+xml",
    };
    const imageMime = imageMimeMap[ext] ?? "application/octet-stream";

    const imageMarkdown = `![${safeName}](../assets/${safeName})`;
    const fm = buildSourceFrontmatter(safeName, "image", now, {
      resource: safeName,
      original_name: safeName,
      original_uri: safeName,
      mime_type: imageMime,
      size_bytes: byteArray.length,
      status: "ready",
      import_ext: ext,
    });
    safeWriteFile(
      path.join(sourcesDir, sourceFileName),
      formatFrontmatter(fm) + "\n" + imageMarkdown,
    );
    const stat = fs.statSync(path.join(sourcesDir, sourceFileName));
    return jsonOk(
      c,
      {
        id: slug,
        space_id: spaceId,
        identity: sourceFileName,
        title: safeName,
        kind: "image",
        original_name: safeName,
        original_uri: safeName,
        storage_path: `raw/sources/${sourceFileName}`,
        mime_type: imageMime,
        size_bytes: stat.size,
        content_hash: sha256(imageMarkdown),
        status: "ready",
        metadata: { import_ext: ext, asset_path: `raw/assets/${safeName}` },
        page_count: 0,
        created_at: now,
        updated_at: now,
      },
      201,
    );
  }

  return jsonError(c, 400, "HTTP_ERROR", `不支持的文件类型: .${ext}`);
});
wikiRoutes.get("/wiki/spaces/:spaceId/sources/:sourceId", async (c) =>
  jsonOk(c, await getWikiSource(c.req.param("spaceId"), c.req.param("sourceId"))),
);
wikiRoutes.delete("/wiki/spaces/:spaceId/sources/:sourceId", async (c) => {
  const rawMode = c.req.query("mode") ?? "detach";
  const mode = rawMode === "delete-orphans" ? "delete-orphans" : "detach";
  return jsonOk(c, await deleteWikiSource(c.req.param("spaceId"), c.req.param("sourceId"), mode));
});
wikiRoutes.get("/wiki/spaces/:spaceId/sources/:sourceId/delete-impact", async (c) =>
  jsonOk(c, await previewDeleteImpact(c.req.param("spaceId"), c.req.param("sourceId"))),
);
// ─── 导入（直接）─────────────────────────────────────────────────
wikiRoutes.post("/wiki/spaces/:spaceId/ingest", async (c) => {
  const spaceId = c.req.param("spaceId");
  const body = await parseJson(c, ingestBodySchema);
  const sourcePath = body.sourcePath;

  // 获取源标题用于导入历史展示
  const sourceTitle = readSourceTitle(spaceId, sourcePath);

  // 记录任务以展示导入历史
  const job = await enqueueIngest(spaceId, sourcePath, undefined, sourceTitle);
  // 立即标记处理中，避免 worker 在 30s 轮询里抢占同一任务并发执行
  await markIngestJobProcessing(spaceId, job.id);

  try {
    const result = await runIngest(spaceId, sourcePath, (message, step, totalSteps) => {
      void markIngestJobProcessing(spaceId, job.id, { message, step, totalSteps });
    });
    markSourceIngested(spaceId, sourcePath);
    // 更新任务完成状态
    await completeIngestJob(
      spaceId,
      job.id,
      result.writtenFiles,
      result.pagesCreated,
      result.pagesUpdated,
    );
    return jsonOk(c, result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await failIngestJob(spaceId, job.id, msg);
    throw err;
  }
});

// ─── 搜索 ──────────────────────────────────────────────────────
wikiRoutes.post("/wiki/spaces/:spaceId/search", async (c) => {
  const spaceId = c.req.param("spaceId");
  const body = await parseJson(c, searchBodySchema);
  return jsonOk(c, await searchWiki(spaceId, body.query, body.topK));
});

// ─── 图谱 ───────────────────────────────────────────────────────
wikiRoutes.get("/wiki/spaces/:spaceId/graph", async (c) =>
  jsonOk(c, await getWikiGraph(c.req.param("spaceId"))),
);
wikiRoutes.get("/wiki/spaces/:spaceId/graph/insights", async (c) =>
  jsonOk(c, await getWikiGraphInsights(c.req.param("spaceId"))),
);

// ─── 导入任务 ───────────────────────────────────────────────────
wikiRoutes.get("/wiki/spaces/:spaceId/jobs/ingest", async (c) =>
  jsonOk(c, await listIngestJobs(c.req.param("spaceId"))),
);
wikiRoutes.post("/wiki/spaces/:spaceId/jobs/ingest", async (c) => {
  const spaceId = c.req.param("spaceId");
  const body = await c.req.json().catch(() => ({}));
  const sourcePath = body.sourcePath as string;
  if (!sourcePath) return jsonError(c, 400, "VALIDATION_ERROR", "sourcePath is required");
  if (sourcePath.includes("..") || sourcePath.startsWith("/") || sourcePath.startsWith("\\")) {
    return jsonError(c, 400, "VALIDATION_ERROR", "sourcePath 包含非法路径字符");
  }
  const folderContext = body.folderContext as string | undefined;

  // 获取源标题用于导入历史展示
  const sourceTitle = readSourceTitle(spaceId, sourcePath);

  return jsonOk(c, await enqueueIngest(spaceId, sourcePath, folderContext, sourceTitle));
});
wikiRoutes.post("/wiki/spaces/:spaceId/jobs/:jobId/cancel", async (c) => {
  await cancelIngestJob(c.req.param("spaceId"), c.req.param("jobId"));
  return jsonOk(c, { success: true });
});
wikiRoutes.post("/wiki/spaces/:spaceId/jobs/:jobId/retry", async (c) => {
  await retryIngestJob(c.req.param("spaceId"), c.req.param("jobId"));
  return jsonOk(c, { success: true });
});

// ─── 检查 ────────────────────────────────────────────────────────
wikiRoutes.post("/wiki/spaces/:spaceId/lint", async (c) =>
  jsonOk(c, await runLint(c.req.param("spaceId"))),
);
wikiRoutes.get("/wiki/spaces/:spaceId/lint-items", async (c) =>
  jsonOk(c, await getLintItems(c.req.param("spaceId"))),
);
