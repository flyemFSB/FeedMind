import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { extractDocument, formatFrontmatter, parseFrontmatter } from "@feedmind/wiki-core";
import { Hono } from "hono";
import {
  wikiPageCreateSchema,
  wikiPageUpdateSchema,
  wikiSourceCreateSchema,
  wikiSpaceCreateSchema,
  wikiSpaceUpdateSchema,
} from "@feedmind/contracts";
import { jsonOk, parseJson } from "../../lib/http.js";
import {
  listWikiSpaces,
  getWikiSpace,
  createWikiSpace,
  updateWikiSpace,
} from "../../modules/wiki/space-registry.js";
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
} from "../../modules/wiki/source-store.js";
import {
  getWikiGraph,
  getWikiGraphInsights,
} from "../../modules/wiki/graph-service.js";
import {
  searchWiki,
} from "../../modules/wiki/search-service.js";
import {
  listIngestJobs,
  enqueueIngest,
  cancelIngestJob,
  retryIngestJob,
  completeIngestJob,
  failIngestJob,
} from "../../modules/wiki/job-service.js";
import {
  runIngest,
} from "../../modules/wiki/ingest-pipeline.js";
import {
  listReviewItems,
  resolveReviewItem,
  dismissReviewItem,
  sweepReviewItems,
} from "../../modules/wiki/review-service.js";
import {
  runLint,
  getLintItems,
} from "../../modules/wiki/lint-service.js";

function sha256(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function sanitizeFileName(name: string): string {
  const normalized = name.replace(/\\/g, "/");
  const parts = normalized.split("/");
  const base = parts[parts.length - 1] ?? name;
  return base.replace(/[^a-zA-Z0-9一-鿿._-]/g, "").replace(/^\.+/, "").replace(/\.{2,}/g, ".") || "untitled";
}

function slugFromName(name: string): string {
  const stem = name.includes(".") ? name.slice(0, name.lastIndexOf(".")) : name;
  return stem.toLowerCase().replace(/[^a-z0-9一-鿿-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "untitled";
}

export const wikiRoutes = new Hono();

// ─── Spaces ────────────────────────────────────────────────────
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

// ─── Pages ─────────────────────────────────────────────────────
wikiRoutes.get("/wiki/spaces/:spaceId/pages", async (c) => {
  const spaceId = c.req.param("spaceId");
  const type = c.req.query("type");
  const q = c.req.query("q");
  const limit = c.req.query("limit") ? Number(c.req.query("limit")) : 50;
  const offset = c.req.query("offset") ? Number(c.req.query("offset")) : 0;
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
  if (!target) return jsonOk(c, { resolved: false, page_id: null, slug: null, title: null, status: "missing", candidates: [] });
  return jsonOk(c, await resolveWikiLink(spaceId, target));
});
wikiRoutes.get("/wiki/spaces/:spaceId/pages/:pageId", async (c) =>
  jsonOk(c, await getWikiPage(c.req.param("spaceId"), c.req.param("pageId"))),
);
wikiRoutes.put("/wiki/spaces/:spaceId/pages/:pageId", async (c) => {
  const spaceId = c.req.param("spaceId");
  const pageId = c.req.param("pageId");
  const payload = await parseJson(c, wikiPageUpdateSchema);
  return jsonOk(c, await updateWikiPage(spaceId, pageId, payload));
});
wikiRoutes.get("/wiki/spaces/:spaceId/pages/:pageId/backlinks", async (c) => {
  const spaceId = c.req.param("spaceId");
  const pageId = c.req.param("pageId");
  return jsonOk(c, await getWikiBacklinks(spaceId, pageId));
});
wikiRoutes.delete("/wiki/spaces/:spaceId/pages/:pageId", async (c) => {
  await deleteWikiPage(c.req.param("spaceId"), c.req.param("pageId"));
  return jsonOk(c, { success: true });
});

// ─── Sources ───────────────────────────────────────────────────
wikiRoutes.get("/wiki/spaces/:spaceId/sources", async (c) => {
  const spaceId = c.req.param("spaceId");
  const status = c.req.query("status");
  const limit = c.req.query("limit") ? Number(c.req.query("limit")) : 50;
  const offset = c.req.query("offset") ? Number(c.req.query("offset")) : 0;
  return jsonOk(c, await listWikiSources(spaceId, { status, limit, offset }));
});
wikiRoutes.post("/wiki/spaces/:spaceId/sources/text", async (c) => {
  const spaceId = c.req.param("spaceId");
  const payload = await parseJson(c, wikiSourceCreateSchema);
  return jsonOk(c, await createWikiSource(spaceId, payload), 201);
});
wikiRoutes.post("/wiki/spaces/:spaceId/sources/files", async (c) => {
  const spaceId = c.req.param("spaceId");
  const contentType = c.req.header("Content-Type") ?? "";

  if (!contentType.includes("multipart/form-data")) {
    return jsonOk(c, { error: "Content-Type must be multipart/form-data" }, 400);
  }

  const formData = await c.req.parseBody();
  const file = formData["file"];
  if (!file || !(file instanceof File)) {
    return jsonOk(c, { error: "File field is required" }, 400);
  }

  const byteArray = new Uint8Array(await file.arrayBuffer());
  const safeName = sanitizeFileName(file.name);
  const ext = safeName.includes(".") ? safeName.split(".").pop()?.toLowerCase() ?? "" : "";
  const slug = slugFromName(safeName);
  const sourceFileName = `${slug}.md`;

  const wikiRoot = (process.env.WIKI_DIR ? path.resolve(process.env.WIKI_DIR) : path.join(process.cwd(), "data", "wiki"));
  const sourcesDir = path.join(wikiRoot, spaceId, "raw", "sources");
  fs.mkdirSync(sourcesDir, { recursive: true });

  const now = new Date().toISOString();
  const textExts = new Set(["md", "txt", "html", "htm", "csv", "json", "yaml", "yml", "xml", "rtf"]);
  const binaryExts = new Set(["pdf", "doc", "docx", "pptx", "xlsx", "xls", "odt", "odp", "ods"]);
  const imageExts = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg"]);

  if (textExts.has(ext)) {
    const decoder = new TextDecoder("utf-8", { fatal: false });
    const text = decoder.decode(byteArray);
    const fm = { title: safeName, kind: "file", original_name: safeName, original_uri: safeName, mime_type: ext === "md" ? "text/markdown" : `text/${ext}`, size_bytes: byteArray.length, created: now, updated: now, import_ext: ext };
    fs.writeFileSync(path.join(sourcesDir, sourceFileName), formatFrontmatter(fm) + "\n" + text, "utf-8");
    const stat = fs.statSync(path.join(sourcesDir, sourceFileName));
    return jsonOk(c, {
      id: slug, space_id: spaceId, identity: sourceFileName, title: safeName,
      kind: "file", original_name: safeName, original_uri: safeName,
      storage_path: `raw/sources/${sourceFileName}`,
      mime_type: ext === "md" ? "text/markdown" : `text/${ext}`,
      size_bytes: stat.size, content_hash: sha256(text),
      status: "ready", metadata: { import_ext: ext }, page_count: 0,
      created_at: now, updated_at: now,
    }, 201);
  }

  if (binaryExts.has(ext)) {
    // 保存临时文件 → 提取文本 → 仅保留 .md
    const binPath = path.join(sourcesDir, safeName);
    fs.writeFileSync(binPath, Buffer.from(byteArray));

    let extractedText = "";
    let docMime = `application/${ext}`;
    let warnings: string[] = [];
    try {
      const doc = await extractDocument(binPath, safeName);
      extractedText = doc.text;
      docMime = doc.mimeType;
      warnings = doc.warnings;
    } catch (err) {
      extractedText = `[Extraction failed: ${err instanceof Error ? err.message : String(err)}]`;
    }

    fs.unlinkSync(binPath); // 删除原始二进制

    const fm = { title: safeName, kind: "file", original_name: safeName, original_uri: safeName, mime_type: docMime, size_bytes: byteArray.length, status: "ready", created: now, updated: now, import_ext: ext };
    fs.writeFileSync(path.join(sourcesDir, sourceFileName), formatFrontmatter(fm) + "\n" + extractedText, "utf-8");
    const stat = fs.statSync(path.join(sourcesDir, sourceFileName));
    return jsonOk(c, {
      id: slug, space_id: spaceId, identity: sourceFileName, title: safeName,
      kind: "file", original_name: safeName, original_uri: safeName,
      storage_path: `raw/sources/${sourceFileName}`,
      mime_type: docMime,
      size_bytes: stat.size, content_hash: sha256(extractedText),
      status: "ready", metadata: { import_ext: ext, extract_warnings: warnings },
      page_count: 0, created_at: now, updated_at: now,
    }, 201);
  }

  if (imageExts.has(ext)) {
    // 图片保存到 raw/assets/，同时在 sources 创建引用 .md
    const assetsDir = path.join(wikiRoot, spaceId, "raw", "assets");
    fs.mkdirSync(assetsDir, { recursive: true });
    const assetPath = path.join(assetsDir, safeName);
    fs.writeFileSync(assetPath, Buffer.from(byteArray));

    const imageMimeMap: Record<string, string> = {
      png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
      gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
    };
    const imageMime = imageMimeMap[ext] ?? "application/octet-stream";

    const imageMarkdown = `![${safeName}](../assets/${safeName})`;
    const fm = { title: safeName, kind: "image", original_name: safeName, original_uri: safeName, mime_type: imageMime, size_bytes: byteArray.length, status: "ready", created: now, updated: now, import_ext: ext };
    fs.writeFileSync(path.join(sourcesDir, sourceFileName), formatFrontmatter(fm) + "\n" + imageMarkdown, "utf-8");
    const stat = fs.statSync(path.join(sourcesDir, sourceFileName));
    return jsonOk(c, {
      id: slug, space_id: spaceId, identity: sourceFileName, title: safeName,
      kind: "image", original_name: safeName, original_uri: safeName,
      storage_path: `raw/sources/${sourceFileName}`,
      mime_type: imageMime,
      size_bytes: stat.size, content_hash: sha256(imageMarkdown),
      status: "ready", metadata: { import_ext: ext, asset_path: `raw/assets/${safeName}` },
      page_count: 0, created_at: now, updated_at: now,
    }, 201);
  }

  return jsonOk(c, { error: `Unsupported file type: .${ext}` }, 400);
});
wikiRoutes.get("/wiki/spaces/:spaceId/sources/:sourceId", async (c) =>
  jsonOk(c, await getWikiSource(c.req.param("spaceId"), c.req.param("sourceId"))),
);
wikiRoutes.delete("/wiki/spaces/:spaceId/sources/:sourceId", async (c) => {
  const mode = (c.req.query("mode") ?? "detach") as "detach" | "delete-orphans";
  return jsonOk(c, await deleteWikiSource(c.req.param("spaceId"), c.req.param("sourceId"), mode));
});
wikiRoutes.get("/wiki/spaces/:spaceId/sources/:sourceId/delete-impact", async (c) =>
  jsonOk(c, await previewDeleteImpact(c.req.param("spaceId"), c.req.param("sourceId"))),
);

// ─── Ingest (Direct) ────────────────────────────────────────────
wikiRoutes.post("/wiki/spaces/:spaceId/ingest", async (c) => {
  const spaceId = c.req.param("spaceId");
  const body = await c.req.json().catch(() => ({}));
  const sourcePath = body.sourcePath as string;
  if (!sourcePath) return jsonOk(c, { error: "sourcePath is required" }, 400);

  // Extract source title from file for import history display
  const wikiRoot = (process.env.WIKI_DIR ? path.resolve(process.env.WIKI_DIR) : path.join(process.cwd(), "data", "wiki"));
  const sourceFilePath = path.join(wikiRoot, spaceId, "raw", "sources", sourcePath);
  let sourceTitle = "";
  try {
    const srcRaw = fs.readFileSync(sourceFilePath, "utf-8");
    const { frontmatter } = parseFrontmatter(srcRaw);
    sourceTitle = (frontmatter.title as string) || "";
  } catch { /* non-critical */ }

  // Record a job entry for import history
  const job = await enqueueIngest(spaceId, sourcePath, undefined, sourceTitle);

  try {
    const result = await runIngest(spaceId, sourcePath);
    // Update job with completion status
    await completeIngestJob(spaceId, job.id, [], result.pagesCreated, result.pagesUpdated);
    return jsonOk(c, result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await failIngestJob(spaceId, job.id, msg);
    throw err;
  }
});

// ─── Search ────────────────────────────────────────────────────
wikiRoutes.post("/wiki/spaces/:spaceId/search", async (c) => {
  const spaceId = c.req.param("spaceId");
  const body = await c.req.json().catch(() => ({}));
  const query = body.query as string || "";
  const topK = Number(body.topK) || 20;
  return jsonOk(c, await searchWiki(spaceId, query, topK));
});

// ─── Graph ─────────────────────────────────────────────────────
wikiRoutes.get("/wiki/spaces/:spaceId/graph", async (c) =>
  jsonOk(c, await getWikiGraph(c.req.param("spaceId"))),
);
wikiRoutes.get("/wiki/spaces/:spaceId/graph/insights", async (c) =>
  jsonOk(c, await getWikiGraphInsights(c.req.param("spaceId"))),
);

// ─── Ingest Jobs ─────────────────────────────────────────────────
wikiRoutes.get("/wiki/spaces/:spaceId/jobs/ingest", async (c) =>
  jsonOk(c, await listIngestJobs(c.req.param("spaceId"))),
);
wikiRoutes.post("/wiki/spaces/:spaceId/jobs/ingest", async (c) => {
  const spaceId = c.req.param("spaceId");
  const body = await c.req.json().catch(() => ({}));
  const sourcePath = body.sourcePath as string;
  const folderContext = body.folderContext as string | undefined;
  if (!sourcePath) return jsonOk(c, { error: "sourcePath is required" }, 400);

  // Extract source title for import history display
  const wikiRoot = (process.env.WIKI_DIR ? path.resolve(process.env.WIKI_DIR) : path.join(process.cwd(), "data", "wiki"));
  const sourceFilePath = path.join(wikiRoot, spaceId, "raw", "sources", sourcePath);
  let sourceTitle = "";
  try {
    const srcRaw = fs.readFileSync(sourceFilePath, "utf-8");
    const { frontmatter } = parseFrontmatter(srcRaw);
    sourceTitle = (frontmatter.title as string) || "";
  } catch { /* non-critical */ }

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

// ─── Lint ──────────────────────────────────────────────────────
wikiRoutes.post("/wiki/spaces/:spaceId/lint", async (c) =>
  jsonOk(c, await runLint(c.req.param("spaceId"))),
);
wikiRoutes.get("/wiki/spaces/:spaceId/lint-items", async (c) =>
  jsonOk(c, await getLintItems(c.req.param("spaceId"))),
);

// ─── Review ────────────────────────────────────────────────────
wikiRoutes.get("/wiki/spaces/:spaceId/review-items", async (c) =>
  jsonOk(c, await listReviewItems(c.req.param("spaceId"))),
);
wikiRoutes.post("/wiki/spaces/:spaceId/review-items/:itemId/resolve", async (c) => {
  await resolveReviewItem(c.req.param("spaceId"), c.req.param("itemId"));
  return jsonOk(c, { success: true });
});
wikiRoutes.post("/wiki/spaces/:spaceId/review-items/:itemId/dismiss", async (c) => {
  await dismissReviewItem(c.req.param("spaceId"), c.req.param("itemId"));
  return jsonOk(c, { success: true });
});
wikiRoutes.post("/wiki/spaces/:spaceId/review-items/sweep", async (c) =>
  jsonOk(c, { swept: await sweepReviewItems(c.req.param("spaceId")) }),
);
