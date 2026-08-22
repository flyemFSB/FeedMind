import fs from "node:fs";
import path from "node:path";
import { IngestCancelledError, runIngest } from "./ingest-pipeline.js";
import { getQueueStore } from "./queue-store.js";
import type { QueueStore } from "./queue-store.js";
import { getWikiRootDir, invalidatePageCache, getSpaceDir } from "./space-fs/index.js";
import {
  markSourceConvertFailed,
  markSourceImportFailed,
  markSourceIngested,
  persistExtractedImages,
  writeConvertedSource,
} from "./source-store.js";
import { extractDocument } from "@feedmind/wiki-core";
import type { IngestJob } from "@feedmind/contracts";
import { getRuntimeOcrConfig } from "../models/config-service.js";
import { logger } from "../../lib/logger.js";

const POLL_INTERVAL_MS = 30_000;

let running = false;
let queuedRerun = false;

/** 转换任务：提取文件文本并回写占位源，完成后自动入队导入。 */
async function convertUploadedSource(
  store: QueueStore,
  spaceId: string,
  job: IngestJob,
  shouldCancel: () => boolean,
): Promise<void> {
  const binPath = path.join(getSpaceDir(spaceId), "raw", "uploads", job.folder_context);
  const slug = job.source_path.replace(/\.md$/i, "");
  const sourceTitle = job.source_title || slug;
  if (!fs.existsSync(binPath)) {
    throw new Error(`上传文件不存在（可能已被删除）: ${job.folder_context}`);
  }
  if (shouldCancel()) throw new IngestCancelledError();
  store.updateStatus(spaceId, job.id, "processing", {
    progress: { message: "正在解析文档内容", step: 0, totalSteps: 1 },
  });
  // PDF 优先 VL-1.6（配置了 OCR 模型时）；未配置/失败在 extract 内部降级本地解析
  const vl = await getRuntimeOcrConfig();
  const doc = await extractDocument(binPath, job.folder_context, undefined, vl ?? undefined);
  if (shouldCancel()) throw new IngestCancelledError();
  const imageNames = persistExtractedImages(spaceId, doc.images ?? new Map());
  writeConvertedSource(spaceId, slug, doc, imageNames);
  // 先入队导入再标转换完成，避免前端轮询因短暂空窗停止刷新
  store.enqueue(spaceId, job.source_path, undefined, sourceTitle);
  store.updateStatus(spaceId, job.id, "done", { written_files: [] });
  logger.info({ spaceId, sourcePath: job.source_path }, "文档转换完成，已入队导入");
}

async function tick() {
  if (running) {
    queuedRerun = true;
    return;
  }
  running = true;

  try {
    do {
      queuedRerun = false;
      const wikiRoot = getWikiRootDir();

      let spaceDirs: string[] = [];
      try {
        spaceDirs = fs
          .readdirSync(wikiRoot, { withFileTypes: true })
          .filter((e) => e.isDirectory() && !e.name.startsWith("."))
          .map((e) => e.name)
          .filter((d) => d !== "registry.json");
      } catch {
        break;
      }

      const store = getQueueStore();

      for (const spaceId of spaceDirs) {
        let job: IngestJob | null;
        while ((job = store.nextPending(spaceId))) {
          const currentJob = job;
          store.updateStatus(spaceId, currentJob.id, "processing");
          logger.info({ spaceId, sourcePath: currentJob.source_path }, "开始处理转换/导入任务");

          try {
            const shouldCancel = () =>
              store.list(spaceId).find((candidate) => candidate.id === currentJob.id)?.status ===
              "cancelled";

            if (currentJob.folder_context) {
              await convertUploadedSource(store, spaceId, currentJob, shouldCancel);
              continue;
            }

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

            // 状态回写在 job 完成前，避免前端最后一轮轮询读到旧状态
            markSourceIngested(spaceId, currentJob.source_path);

            store.updateStatus(spaceId, currentJob.id, "done", {
              written_files: result.writtenFiles,
              pages_created: result.pagesCreated,
              pages_updated: result.pagesUpdated,
            });

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

            // 单任务失败记录错误，不阻塞队列后续推进
            const slug = currentJob.source_path.replace(/\.md$/i, "");
            if (currentJob.folder_context) {
              markSourceConvertFailed(spaceId, slug, msg);
            } else {
              markSourceImportFailed(spaceId, slug, msg);
            }
            store.updateStatus(spaceId, currentJob.id, "failed", { error: msg });
          }
        }
      }
    } while (queuedRerun);
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
  if (running) {
    queuedRerun = true;
    return;
  }
  void tick();
}

export function startIngestWorker(): void {
  setInterval(() => {
    void tick();
  }, POLL_INTERVAL_MS);
  void tick();
  logger.info({ pollIntervalMs: POLL_INTERVAL_MS }, "导入 worker 已启动");
}
