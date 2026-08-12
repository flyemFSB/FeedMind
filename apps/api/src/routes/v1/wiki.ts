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
  markSourceIngested,
  saveUploadedSource,
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
import { readSourceTitle, validateSpaceId } from "../../modules/wiki/space-fs/index.js";

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
  return jsonOk(
    c,
    await listWikiPages(spaceId, {
      limit,
      offset,
      ...(type !== undefined ? { type } : {}),
      ...(q !== undefined ? { q } : {}),
    }),
  );
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
  return jsonOk(
    c,
    await listWikiSources(spaceId, {
      limit,
      offset,
      ...(status !== undefined ? { status } : {}),
    }),
  );
});
wikiRoutes.post("/wiki/spaces/:spaceId/sources/text", async (c) => {
  const spaceId = c.req.param("spaceId");
  const payload = await parseJson(c, wikiSourceCreateSchema);
  return jsonOk(c, await createWikiSource(spaceId, payload), 201);
});
wikiRoutes.post("/wiki/spaces/:spaceId/sources/files", async (c) => {
  const spaceId = c.req.param("spaceId");
  validateSpaceId(spaceId);
  if (!(c.req.header("Content-Type") ?? "").includes("multipart/form-data")) {
    return jsonError(c, 400, "VALIDATION_ERROR", "Content-Type 必须为 multipart/form-data");
  }
  const formData = await c.req.parseBody();
  const file = formData["file"];
  if (!file || !(file instanceof File)) {
    return jsonError(c, 400, "VALIDATION_ERROR", "缺少 file 字段");
  }
  const source = await saveUploadedSource(
    spaceId,
    file.name,
    new Uint8Array(await file.arrayBuffer()),
  );
  autoIngestUpload(spaceId, source.identity, source.title);
  return jsonOk(c, source, 201);
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
