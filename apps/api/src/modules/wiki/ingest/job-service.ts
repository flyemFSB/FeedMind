import type { IngestJob, IngestProgress } from "@feedmind/contracts";
import { getQueueStore } from "./queue-store.js";

export async function listIngestJobs(spaceId: string): Promise<IngestJob[]> {
  return getQueueStore().list(spaceId);
}

export async function enqueueIngest(
  spaceId: string,
  sourcePath: string,
  folderContext?: string,
  sourceTitle?: string,
): Promise<IngestJob> {
  return getQueueStore().enqueue(spaceId, sourcePath, folderContext, sourceTitle);
}

/** 标记任务为处理中并写入进度。置为 processing 后 worker 不再抢占该任务。 */
export async function markIngestJobProcessing(
  spaceId: string,
  jobId: string,
  progress?: IngestProgress,
): Promise<void> {
  getQueueStore().updateStatus(spaceId, jobId, "processing", progress ? { progress } : undefined);
}

export async function cancelIngestJob(spaceId: string, jobId: string): Promise<void> {
  getQueueStore().updateStatus(spaceId, jobId, "cancelled");
}

export async function completeIngestJob(
  spaceId: string,
  jobId: string,
  written_files: string[],
  pages_created?: number,
  pages_updated?: number,
): Promise<void> {
  getQueueStore().updateStatus(spaceId, jobId, "done", {
    written_files,
    ...(pages_created !== undefined ? { pages_created } : {}),
    ...(pages_updated !== undefined ? { pages_updated } : {}),
  });
}

export async function failIngestJob(spaceId: string, jobId: string, error: string): Promise<void> {
  getQueueStore().updateStatus(spaceId, jobId, "failed", { error });
}
