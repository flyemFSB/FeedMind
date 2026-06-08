import fs from "node:fs";
import path from "node:path";
import { formatFrontmatter, parseFrontmatter } from "@feedmind/wiki-core";
import { runIngest, extractIdentity } from "./ingest-pipeline.js";
import { getQueueStore } from "./queue-store.js";
import { invalidatePageFileCache } from "./page-store.js";
import { spaceDir, wikiRootDir, nowISO, safeWriteFile } from "./wiki-utils.js";

const POLL_INTERVAL_MS = 30_000;
const MAX_RETRIES = 3;

/**
 * Background worker: polls spaces for pending ingest jobs and processes them.
 */
export function startIngestWorker(): void {
  let running = false;

  async function tick() {
    if (running) return;
    running = true;

    try {
      const wikiRoot = wikiRootDir();

      let spaceDirs: string[] = [];
      try {
        spaceDirs = fs.readdirSync(wikiRoot, { withFileTypes: true })
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
        console.log(`[ingest-worker] ${spaceId}: processing ${job.sourcePath}`);

        try {
          const result = await runIngest(spaceId, job.sourcePath, (message, step, totalSteps) => {
            store.updateStatus(spaceId, job.id, "processing", {
              progress: { message, step, totalSteps },
            });
          });

          // Invalidate page cache so newly created pages appear immediately
          invalidatePageFileCache(spaceId);

          // Mark job as done instead of removing — keeps import history
          store.updateStatus(spaceId, job.id, "done", {
            writtenFiles: [],
            pagesCreated: result.pagesCreated,
            pagesUpdated: result.pagesUpdated,
          });

          // Mark source as ingested
          try {
            const sourcePath = path.join(spaceDir(spaceId), "raw", "sources", extractIdentity(job.sourcePath));
            if (fs.existsSync(sourcePath)) {
              const raw = fs.readFileSync(sourcePath, "utf-8");
              const { frontmatter, body } = parseFrontmatter(raw);
              frontmatter.status = "ingested";
              frontmatter.ingested_at = nowISO();
              frontmatter.page_count = result.pagesCreated;
              safeWriteFile(sourcePath, formatFrontmatter(frontmatter) + "\n" + body);
            }
          } catch { /* non-critical */ }

          console.log(`[ingest-worker] ${spaceId}: done — ${result.pagesCreated} created, ${result.pagesUpdated} updated`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[ingest-worker] ${spaceId}: job ${job.id} failed: ${msg}`);

          if ((job.retryCount ?? 0) >= MAX_RETRIES) {
            store.updateStatus(spaceId, job.id, "failed", { error: msg });
          } else {
            store.retry(spaceId, job.id);
          }
        }

        break; // one job per tick
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("abort")) {
        console.error(`[ingest-worker] Error: ${msg}`);
      }
    } finally {
      running = false;
    }
  }

  setInterval(tick, POLL_INTERVAL_MS);
  tick().catch(() => {});
  console.log(`[ingest-worker] Started (poll every ${POLL_INTERVAL_MS}ms)`);
}
