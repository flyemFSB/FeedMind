import fs from "node:fs";
import path from "node:path";
import { formatFrontmatter, parseFrontmatter } from "@feedmind/wiki-core";
import { runIngest, extractIdentity } from "./ingest-pipeline.js";
import { getQueueStore } from "./queue-store.js";
import {
  getSpaceDir,
  getWikiRootDir,
  nowISO,
  safeWriteFile,
  invalidatePageCache,
} from "./space-fs/index.js";
import { logger } from "../../lib/logger.js";

const POLL_INTERVAL_MS = 30_000;
const MAX_RETRIES = 3;

export function startIngestWorker(): void {
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
          const result = await runIngest(spaceId, job.source_path, (message, step, totalSteps) => {
            store.updateStatus(spaceId, job.id, "processing", {
              progress: { message, step, totalSteps },
            });
          });

          invalidatePageCache(spaceId);

          store.updateStatus(spaceId, job.id, "done", {
            written_files: [],
            pages_created: result.pagesCreated,
            pages_updated: result.pagesUpdated,
          });

          try {
            const sourcePath = path.join(
              getSpaceDir(spaceId),
              "raw",
              "sources",
              extractIdentity(job.source_path),
            );
            if (fs.existsSync(sourcePath)) {
              const raw = fs.readFileSync(sourcePath, "utf-8");
              const { frontmatter, body } = parseFrontmatter(raw);
              frontmatter.status = "ingested";
              frontmatter.ingested_at = nowISO();
              frontmatter.page_count = result.pagesCreated;
              safeWriteFile(sourcePath, formatFrontmatter(frontmatter) + "\n" + body);
            }
          } catch {
            /* 非关键操作 */
          }

          logger.info(
            { spaceId, pagesCreated: result.pagesCreated, pagesUpdated: result.pagesUpdated },
            "导入任务完成",
          );
        } catch (err) {
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

  setInterval(() => {
    void tick();
  }, POLL_INTERVAL_MS);
  void tick();
  logger.info({ pollIntervalMs: POLL_INTERVAL_MS }, "导入 worker 已启动");
}
