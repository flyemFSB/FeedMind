import type { IngestJob, IngestJobStatus } from "@feedmind/contracts";

/** 创建新的导入队列条目 */
export function createIngestJob(
  projectId: string,
  sourcePath: string,
  folderContext?: string,
  sourceTitle?: string,
): IngestJob {
  return {
    id: `ingest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    projectId,
    sourcePath,
    sourceTitle: sourceTitle ?? "",
    folderContext: folderContext ?? "",
    status: "pending",
    progress: null,
    addedAt: Date.now(),
    startedAt: null,
    completedAt: null,
    error: null,
    retryCount: 0,
    writtenFiles: [],
    pagesCreated: 0,
    pagesUpdated: 0,
  };
}

/** 从 JSON 字符串加载队列 */
export function loadQueue(json: string): IngestJob[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** 将队列序列化为 JSON 字符串 */
export function dumpQueue(queue: IngestJob[]): string {
  return JSON.stringify(queue, null, 2);
}

/**
 * 将任务插入队列。如果同来源已有 pending/failed 状态的任务，则不重复添加。
 */
export function upsertJob(queue: IngestJob[], job: IngestJob): IngestJob[] {
  const existing = queue.findIndex(
    (j) => j.sourcePath === job.sourcePath && (j.status === "pending" || j.status === "failed"),
  );
  if (existing >= 0) {
    // 如果已在 pending 则不重复入队
    if (queue[existing].status === "pending") return queue;
    // 替换失败的旧条目
    const updated = [...queue];
    updated[existing] = job;
    return updated;
  }
  return [...queue, job];
}

/** 获取项目中下一个待处理任务 */
export function nextJob(queue: IngestJob[], projectId: string): IngestJob | null {
  return queue.find((j) => j.projectId === projectId && j.status === "pending") ?? null;
}

/** 更新任务状态 */
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
      completedAt:
        status === "done" || status === "failed" || status === "cancelled" ? now : j.completedAt,
    };
  });
}

/** 增加失败任务的重试计数 */
export function incrementRetry(queue: IngestJob[], jobId: string): IngestJob[] {
  return queue.map((j) => {
    if (j.id !== jobId) return j;
    return {
      ...j,
      status: "pending" as IngestJobStatus,
      retryCount: j.retryCount + 1,
      error: null,
    };
  });
}

/** 移除早于给定时间戳的已完成/已取消任务 */
export function pruneQueue(queue: IngestJob[], olderThan: number): IngestJob[] {
  return queue.filter(
    (j) =>
      !(j.status === "done" || j.status === "cancelled") ||
      (j.completedAt && j.completedAt > olderThan),
  );
}
