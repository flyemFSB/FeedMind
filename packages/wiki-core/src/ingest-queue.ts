import type { IngestJob, IngestJobStatus } from "@feedmind/contracts";

export function createIngestJob(
  project_id: string,
  source_path: string,
  folder_context?: string,
  source_title?: string,
): IngestJob {
  return {
    id: `ingest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    project_id,
    source_path,
    source_title: source_title ?? "",
    folder_context: folder_context ?? "",
    status: "pending",
    progress: null,
    added_at: Date.now(),
    started_at: null,
    completed_at: null,
    error: null,
    retry_count: 0,
    written_files: [],
    pages_created: 0,
    pages_updated: 0,
  };
}

export function loadQueue(json: string): IngestJob[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function dumpQueue(queue: IngestJob[]): string {
  return JSON.stringify(queue, null, 2);
}

/** 同来源已有 pending/failed 任务时不重复添加 */
export function upsertJob(queue: IngestJob[], job: IngestJob): IngestJob[] {
  const existing = queue.findIndex(
    (j) => j.source_path === job.source_path && (j.status === "pending" || j.status === "failed"),
  );
  if (existing >= 0) {
    if (queue[existing]?.status === "pending") return queue;
    const updated = [...queue];
    updated[existing] = job;
    return updated;
  }
  return [...queue, job];
}

export function nextJob(queue: IngestJob[], project_id: string): IngestJob | null {
  return queue.find((j) => j.project_id === project_id && j.status === "pending") ?? null;
}

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
      started_at: status === "processing" ? now : j.started_at,
      completed_at:
        status === "done" || status === "failed" || status === "cancelled" ? now : j.completed_at,
    };
  });
}

export function incrementRetry(queue: IngestJob[], jobId: string): IngestJob[] {
  return queue.map((j) => {
    if (j.id !== jobId) return j;
    return {
      ...j,
      status: "pending" as IngestJobStatus,
      retry_count: j.retry_count + 1,
      error: null,
    };
  });
}

export function pruneQueue(queue: IngestJob[], olderThan: number): IngestJob[] {
  return queue.filter(
    (j) =>
      !(j.status === "done" || j.status === "cancelled") ||
      (j.completed_at && j.completed_at > olderThan),
  );
}

/** 进程重启后没有执行中的 worker，遗留 processing 任务可安全恢复为待处理。 */
export function restoreQueue(queue: IngestJob[]): IngestJob[] {
  return queue.map((job) =>
    job.status === "processing"
      ? { ...job, status: "pending" as IngestJobStatus, progress: null, started_at: null }
      : job,
  );
}
