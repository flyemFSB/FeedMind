import type { IngestJob } from "@feedmind/contracts";
import { getQueueStore } from "./queue-store.js";

export async function listIngestJobs(spaceId: string): Promise<IngestJob[]> {
  return getQueueStore().list(spaceId);
}

export async function enqueueIngest(
  spaceId: string,
  sourcePath: string,
  folderContext?: string,
): Promise<IngestJob> {
  return getQueueStore().enqueue(spaceId, sourcePath, folderContext);
}

export async function cancelIngestJob(spaceId: string, jobId: string): Promise<void> {
  getQueueStore().updateStatus(spaceId, jobId, "cancelled");
}

export async function retryIngestJob(spaceId: string, jobId: string): Promise<void> {
  getQueueStore().retry(spaceId, jobId);
}

export async function processNextIngest(spaceId: string): Promise<IngestJob | null> {
  const job = getQueueStore().nextPending(spaceId);
  if (!job) return null;
  getQueueStore().updateStatus(spaceId, job.id, "processing");
  return job;
}

export async function completeIngestJob(spaceId: string, jobId: string, writtenFiles: string[]): Promise<void> {
  getQueueStore().updateStatus(spaceId, jobId, "done", { writtenFiles });
}

export async function failIngestJob(spaceId: string, jobId: string, error: string): Promise<void> {
  getQueueStore().updateStatus(spaceId, jobId, "failed", { error });
}
