import fs from "node:fs";
import { IngestCancelledError, runIngest } from "./ingest-pipeline.js";
import { getQueueStore } from "./queue-store.js";
import { getWikiRootDir, invalidatePageCache } from "./space-fs/index.js";
import { markSourceIngested } from "./source-store.js";
import { logger } from "../../lib/logger.js";

const POLL_INTERVAL_MS = 30_000;
const MAX_RETRIES = 3;

let running = false;

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
      const job = store.nextPending(spaceId);
      if (!job) continue;

      store.updateStatus(spaceId, job.id, "processing");
      logger.info({ spaceId, sourcePath: job.source_path }, "开始处理导入任务");

      try {
        const shouldCancel = () =>
          store.list(spaceId).find((candidate) => candidate.id === job.id)?.status === "cancelled";
        const result = await runIngest(
          spaceId,
          job.source_path,
          (message, step, totalSteps) => {
            store.updateStatus(spaceId, job.id, "processing", {
              progress: { message, step, totalSteps },
            });
          },
          shouldCancel,
        );

        invalidatePageCache(spaceId);

        store.updateStatus(spaceId, job.id, "done", {
          written_files: result.writtenFiles,
          pages_created: result.pagesCreated,
          pages_updated: result.pagesUpdated,
        });

        markSourceIngested(spaceId, job.source_path);

        logger.info(
          { spaceId, pagesCreated: result.pagesCreated, pagesUpdated: result.pagesUpdated },
          "导入任务完成",
        );
      } catch (err) {
        if (err instanceof IngestCancelledError) {
          store.updateStatus(spaceId, job.id, "cancelled", { error: null });
          continue;
        }
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ spaceId, jobId: job.id, err }, "导入任务失败");

        if ((job.retry_count ?? 0) >= MAX_RETRIES) {
          store.updateStatus(spaceId, job.id, "failed", { error: msg });
        } else {
          store.retry(spaceId, job.id);
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
