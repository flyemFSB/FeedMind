import fs from "node:fs";
import path from "node:path";
import { loadQueue, dumpQueue, createIngestJob, upsertJob, nextJob, updateJobStatus, incrementRetry } from "@feedmind/wiki-core";
import type { IngestJob, IngestJobStatus } from "@feedmind/contracts";
import { spaceDir } from "./wiki-utils.js";

export interface QueueStore {
  list(spaceId: string): IngestJob[];
  enqueue(spaceId: string, sourcePath: string, folderContext?: string): IngestJob;
  nextPending(spaceId: string): IngestJob | null;
  updateStatus(spaceId: string, jobId: string, status: IngestJobStatus, updates?: Partial<IngestJob>): void;
  retry(spaceId: string, jobId: string): void;
  remove(spaceId: string, jobId: string): void;
}

export class JsonQueueStore implements QueueStore {
  private queuePath(spaceId: string): string {
    return path.join(spaceDir(spaceId), ".llm-wiki", "ingest-queue.json");
  }

  private readQueue(spaceId: string): IngestJob[] {
    try {
      return loadQueue(fs.readFileSync(this.queuePath(spaceId), "utf-8"));
    } catch {
      return [];
    }
  }

  private writeQueue(spaceId: string, queue: IngestJob[]): void {
    const dir = path.dirname(this.queuePath(spaceId));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.queuePath(spaceId), dumpQueue(queue), "utf-8");
  }

  list(spaceId: string): IngestJob[] {
    return this.readQueue(spaceId);
  }

  enqueue(spaceId: string, sourcePath: string, folderContext?: string): IngestJob {
    const queue = this.readQueue(spaceId);
    const job = createIngestJob(spaceId, sourcePath, folderContext);
    const updated = upsertJob(queue, job);
    this.writeQueue(spaceId, updated);
    return job;
  }

  nextPending(spaceId: string): IngestJob | null {
    return nextJob(this.readQueue(spaceId), spaceId);
  }

  updateStatus(spaceId: string, jobId: string, status: IngestJobStatus, updates?: Partial<IngestJob>): void {
    const queue = this.readQueue(spaceId);
    this.writeQueue(spaceId, updateJobStatus(queue, jobId, status, updates));
  }

  retry(spaceId: string, jobId: string): void {
    const queue = this.readQueue(spaceId);
    this.writeQueue(spaceId, incrementRetry(queue, jobId));
  }

  remove(spaceId: string, jobId: string): void {
    const queue = this.readQueue(spaceId);
    this.writeQueue(spaceId, queue.filter((j) => j.id !== jobId));
  }
}

// Singleton — lazily initialized
let _instance: QueueStore | null = null;

export function getQueueStore(): QueueStore {
  if (!_instance) _instance = new JsonQueueStore();
  return _instance;
}

export function setQueueStore(store: QueueStore): void {
  _instance = store;
}
