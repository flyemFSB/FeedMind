import fs from "node:fs";
import path from "node:path";
import {
  loadQueue,
  dumpQueue,
  createIngestJob,
  upsertJob,
  nextJob,
  updateJobStatus,
  incrementRetry,
  restoreQueue,
} from "@feedmind/wiki-core";
import type { IngestJob, IngestJobStatus } from "@feedmind/contracts";
import { ensureDir, getSpaceDir, safeWriteFile } from "../space-fs/index.js";

export interface QueueStore {
  list(spaceId: string): IngestJob[];
  enqueue(
    spaceId: string,
    sourcePath: string,
    folderContext?: string,
    sourceTitle?: string,
  ): IngestJob;
  nextPending(spaceId: string): IngestJob | null;
  updateStatus(
    spaceId: string,
    jobId: string,
    status: IngestJobStatus,
    updates?: Partial<IngestJob>,
  ): void;
  retry(spaceId: string, jobId: string): void;
  remove(spaceId: string, jobId: string): void;
}

export class JsonQueueStore implements QueueStore {
  // restoreQueue 是崩溃恢复：进程重启后遗留的 processing 任务重置为 pending。
  // 只能在启动时执行一次——每次读取都恢复会抹掉进度/开始时间，导致前端永远看不到进度。
  private restoredSpaces = new Set<string>();

  private queuePath(spaceId: string): string {
    return path.join(getSpaceDir(spaceId), ".feedmind", "ingest-queue.json");
  }

  private readQueue(spaceId: string): IngestJob[] {
    try {
      const queue = loadQueue(fs.readFileSync(this.queuePath(spaceId), "utf-8"));
      if (!this.restoredSpaces.has(spaceId)) {
        this.restoredSpaces.add(spaceId);
        const restored = restoreQueue(queue);
        if (restored.some((job, i) => job.status !== queue[i]?.status)) {
          this.writeQueue(spaceId, restored);
        }
        return restored;
      }
      return queue;
    } catch {
      return [];
    }
  }

  private writeQueue(spaceId: string, queue: IngestJob[]): void {
    const dir = path.dirname(this.queuePath(spaceId));
    ensureDir(dir);
    safeWriteFile(this.queuePath(spaceId), dumpQueue(queue));
  }

  list(spaceId: string): IngestJob[] {
    return this.readQueue(spaceId);
  }

  enqueue(
    spaceId: string,
    sourcePath: string,
    folderContext?: string,
    sourceTitle?: string,
  ): IngestJob {
    const queue = this.readQueue(spaceId);
    const job = createIngestJob(spaceId, sourcePath, folderContext, sourceTitle);
    const updated = upsertJob(queue, job);
    this.writeQueue(spaceId, updated);
    return job;
  }

  nextPending(spaceId: string): IngestJob | null {
    return nextJob(this.readQueue(spaceId), spaceId);
  }

  updateStatus(
    spaceId: string,
    jobId: string,
    status: IngestJobStatus,
    updates?: Partial<IngestJob>,
  ): void {
    const queue = this.readQueue(spaceId);
    this.writeQueue(spaceId, updateJobStatus(queue, jobId, status, updates));
  }

  retry(spaceId: string, jobId: string): void {
    const queue = this.readQueue(spaceId);
    this.writeQueue(spaceId, incrementRetry(queue, jobId));
  }

  remove(spaceId: string, jobId: string): void {
    const queue = this.readQueue(spaceId);
    this.writeQueue(
      spaceId,
      queue.filter((j) => j.id !== jobId),
    );
  }
}

// 单例——延迟初始化
let _instance: QueueStore | null = null;

export function getQueueStore(): QueueStore {
  _instance ??= new JsonQueueStore();
  return _instance;
}
