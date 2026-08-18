import fs from "node:fs";
import path from "node:path";
import { IngestCancelledError, runIngest } from "./ingest-pipeline.js";
import { getQueueStore } from "./queue-store.js";
import type { QueueStore } from "./queue-store.js";
import { getWikiRootDir, invalidatePageCache, getSpaceDir, safeUnlink } from "./space-fs/index.js";
import {
  markSourceConvertFailed,
  markSourceIngested,
  persistExtractedImages,
  writeConvertedSource,
} from "./source-store.js";
import { extractDocument } from "@feedmind/wiki-core";
import type { IngestJob } from "@feedmind/contracts";
import { getRuntimeOcrConfig } from "../models/config-service.js";
import { logger } from "../../lib/logger.js";

const POLL_INTERVAL_MS = 30_000;
const MAX_RETRIES = 3;

let running = false;

/**
 * 转换任务（上传的 .pdf/.docx/...）：提取文本回写占位源，完成后自动入队导入。
 * 任务标识：folder_context 非空（存临时二进制文件名）即转换任务；导入任务的
 * folder_context 恒为空（手动导入/自动入队都不传目录上下文）。
 */
async function convertUploadedSource(
  store: QueueStore,
  spaceId: string,
  job: IngestJob,
): Promise<void> {
  const sourcesDir = path.join(getSpaceDir(spaceId), "raw", "sources");
  const binPath = path.join(sourcesDir, job.folder_context);
  const slug = job.source_path.replace(/\.md$/i, "");
  const sourceTitle = job.source_title || slug;
  try {
    if (!fs.existsSync(binPath)) {
      throw new Error(`临时文件不存在（可能已被清理）: ${job.folder_context}`);
    }
    store.updateStatus(spaceId, job.id, "processing", {
      progress: { message: "正在解析文档内容", step: 0, totalSteps: 1 },
    });
    // PDF 优先 VL-1.6（配置了 OCR 模型时）；未配置/失败在 extract 内部降级本地解析
    const vl = await getRuntimeOcrConfig();
    const doc = await extractDocument(binPath, job.folder_context, undefined, vl ?? undefined);
    // 清理临时文件尽力而为（同上传路径：失败不阻塞，残留被同名下次上传覆盖）
    try {
      safeUnlink(binPath);
    } catch (err) {
      logger.warn({ err, path: binPath }, "临时文件清理失败");
    }
    const imageNames = persistExtractedImages(spaceId, doc.images ?? new Map());
    writeConvertedSource(spaceId, slug, doc, imageNames);
    // 先标记 convert done 再入队 ingest：upsertJob 会拦截同 source_path 的
    // pending/failed 任务，顺序颠倒会导致导入任务永远进不了队列
    store.updateStatus(spaceId, job.id, "done", { written_files: [] });
    store.enqueue(spaceId, job.source_path, undefined, sourceTitle);
    logger.info({ spaceId, sourcePath: job.source_path }, "文档转换完成，已入队导入");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ spaceId, jobId: job.id, err }, "文档转换失败");
    markSourceConvertFailed(spaceId, slug, msg);
    try {
      safeUnlink(binPath);
    } catch {
      /* 清理失败不阻塞 */
    }
    store.updateStatus(spaceId, job.id, "failed", { error: msg });
  }
}

async function tick() {
  if (running) return;
  running = true;

  try {
    const wikiRoot = getWikiRootDir();

    let spaceDirs: string[] = [];
    try {
      spaceDirs = fs
        .readdirSync(wikiRoot, { withFileTypes: true })
        .filter((e) => e.isDirectory() && !e.name.startsWith("."))
        .map((e) => e.name)
        .filter((d) => d !== "registry.json");
    } catch {
      return;
    }

    const store = getQueueStore();

    for (const spaceId of spaceDirs) {
      // while 而非 for：转换任务完成后入队的导入任务在同一 tick 内接着处理
      let job: IngestJob | null;
      while ((job = store.nextPending(spaceId))) {
        // currentJob 固定本次迭代引用：catch 块内 TS 无法保持 while 条件的收窄
        const currentJob = job;
        store.updateStatus(spaceId, currentJob.id, "processing");
        logger.info({ spaceId, sourcePath: currentJob.source_path }, "开始处理转换/导入任务");

        try {
          if (currentJob.folder_context) {
            await convertUploadedSource(store, spaceId, currentJob);
            continue;
          }

          const shouldCancel = () =>
            store.list(spaceId).find((candidate) => candidate.id === currentJob.id)?.status ===
            "cancelled";
          const result = await runIngest(
            spaceId,
            currentJob.source_path,
            (message, step, totalSteps) => {
              store.updateStatus(spaceId, currentJob.id, "processing", {
                progress: { message, step, totalSteps },
              });
            },
            shouldCancel,
          );

          invalidatePageCache(spaceId);

          store.updateStatus(spaceId, currentJob.id, "done", {
            written_files: result.writtenFiles,
            pages_created: result.pagesCreated,
            pages_updated: result.pagesUpdated,
          });

          markSourceIngested(spaceId, currentJob.source_path);

          logger.info(
            { spaceId, pagesCreated: result.pagesCreated, pagesUpdated: result.pagesUpdated },
            "导入任务完成",
          );
        } catch (err) {
          if (err instanceof IngestCancelledError) {
            store.updateStatus(spaceId, currentJob.id, "cancelled", { error: null });
            continue;
          }
          const msg = err instanceof Error ? err.message : String(err);
          logger.error({ spaceId, jobId: currentJob.id, err }, "导入任务失败");

          if ((currentJob.retry_count ?? 0) >= MAX_RETRIES) {
            store.updateStatus(spaceId, currentJob.id, "failed", { error: msg });
          } else {
            store.retry(spaceId, currentJob.id);
          }
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("abort")) {
      logger.error({ err }, "导入 worker 轮询异常");
    }
  } finally {
    running = false;
  }
}

/** 上传后立即唤醒 worker 处理新入队的任务，无需等待下一轮轮询。 */
export function wakeIngestWorker(): void {
  void tick();
}

export function startIngestWorker(): void {
  setInterval(() => {
    void tick();
  }, POLL_INTERVAL_MS);
  void tick();
  logger.info({ pollIntervalMs: POLL_INTERVAL_MS }, "导入 worker 已启动");
}
