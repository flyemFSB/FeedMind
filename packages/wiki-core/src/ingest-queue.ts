import type { IngestJob, IngestJobStatus } from "@feedmind/contracts";

/**
 * Create a new ingest queue entry.
 */
export function createIngestJob(
  projectId: string,
  sourcePath: string,
  folderContext?: string,
): IngestJob {
  return {
    id: `ingest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    projectId,
    sourcePath,
    folderContext: folderContext ?? "",
    status: "pending",
    addedAt: Date.now(),
    startedAt: null,
    completedAt: null,
    error: null,
    retryCount: 0,
    writtenFiles: [],
  };
}

/**
 * Load queue from JSON string.
 */
export function loadQueue(json: string): IngestJob[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Serialize queue to JSON string.
 */
export function dumpQueue(queue: IngestJob[]): string {
  return JSON.stringify(queue, null, 2);
}

/**
 * Upsert a job into the queue. If a pending/failed job for the same
 * source already exists, don't duplicate.
 */
export function upsertJob(queue: IngestJob[], job: IngestJob): IngestJob[] {
  const existing = queue.findIndex(
    (j) =>
      j.sourcePath === job.sourcePath &&
      (j.status === "pending" || j.status === "failed"),
  );
  if (existing >= 0) {
    // Don't re-queue if already pending
    if (queue[existing].status === "pending") return queue;
    // Replace failed entry
    const updated = [...queue];
    updated[existing] = job;
    return updated;
  }
  return [...queue, job];
}

/**
 * Get the next pending job for a project.
 */
export function nextJob(queue: IngestJob[], projectId: string): IngestJob | null {
  return queue.find((j) => j.projectId === projectId && j.status === "pending") ?? null;
}

/**
 * Update a job's status.
 */
export function updateJobStatus(
  queue: IngestJob[],
  jobId: string,
  status: IngestJobStatus,
  updates?: Partial<IngestJob>,
): IngestJob[] {
  return queue.map((j) => {
    if (j.id !== jobId) return j;
    const now = Date.now();
    return {
      ...j,
      ...updates,
      status,
      startedAt: status === "processing" ? now : j.startedAt,
      completedAt: status === "done" || status === "failed" || status === "cancelled" ? now : j.completedAt,
    };
  });
}

/**
 * Increment retry count for a failed job.
 */
export function incrementRetry(queue: IngestJob[], jobId: string): IngestJob[] {
  return queue.map((j) => {
    if (j.id !== jobId) return j;
    return { ...j, status: "pending" as IngestJobStatus, retryCount: j.retryCount + 1, error: null };
  });
}

/**
 * Remove cancelled/done jobs older than the given timestamp.
 */
export function pruneQueue(queue: IngestJob[], olderThan: number): IngestJob[] {
  return queue.filter(
    (j) =>
      !(j.status === "done" || j.status === "cancelled") ||
      (j.completedAt && j.completedAt > olderThan),
  );
}
