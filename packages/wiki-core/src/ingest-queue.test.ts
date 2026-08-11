import { describe, expect, it } from "vitest";
import type { IngestJob } from "@feedmind/contracts";
import {
  createIngestJob,
  dumpQueue,
  incrementRetry,
  loadQueue,
  nextJob,
  pruneQueue,
  restoreQueue,
  updateJobStatus,
  upsertJob,
} from "./ingest-queue.js";

const makeJob = (sourcePath: string): IngestJob =>
  createIngestJob("proj-1", sourcePath, "folder", "标题");

describe("createIngestJob", () => {
  it("生成 pending 状态的任务", () => {
    const job = makeJob("/a.md");
    expect(job.project_id).toBe("proj-1");
    expect(job.status).toBe("pending");
    expect(job.retry_count).toBe(0);
    expect(job.id).toMatch(/^ingest-/);
  });
});

describe("loadQueue / dumpQueue", () => {
  it("JSON 数组往返", () => {
    const queue = [makeJob("a.md")];
    expect(loadQueue(dumpQueue(queue))).toEqual(queue);
  });

  it("非法 JSON 与非数组返回空数组", () => {
    expect(loadQueue("not json")).toEqual([]);
    expect(loadQueue('{"a":1}')).toEqual([]);
  });
});

describe("upsertJob", () => {
  it("同源 pending 任务不重复添加", () => {
    const queue = [makeJob("a.md")];
    expect(upsertJob(queue, makeJob("a.md"))).toHaveLength(1);
  });

  it("同源 failed 任务被新任务替换", () => {
    const job = makeJob("a.md");
    const failed = updateJobStatus([job], job.id, "failed");
    const replacement = makeJob("a.md");
    const replaced = upsertJob(failed, replacement);
    expect(replaced).toHaveLength(1);
    // 必须是新任务而非保留旧任务
    expect(replaced[0]?.id).toBe(replacement.id);
    expect(replaced[0]?.status).toBe("pending");
  });

  it("新来源追加到队尾", () => {
    const queue = [makeJob("a.md")];
    expect(upsertJob(queue, makeJob("b.md"))).toHaveLength(2);
  });
});

describe("nextJob / updateJobStatus", () => {
  it("按项目取第一个 pending 任务", () => {
    const queue = [makeJob("a.md"), makeJob("b.md")];
    expect(nextJob(queue, "proj-1")?.source_path).toBe("a.md");
    expect(nextJob(queue, "proj-2")).toBeNull();
  });

  it("processing 记录 started_at，done 记录 completed_at", () => {
    let queue = [makeJob("a.md")];
    const id = queue[0]!.id;
    queue = updateJobStatus(queue, id, "processing");
    expect(queue[0]?.started_at).toBeTruthy();
    queue = updateJobStatus(queue, id, "done");
    expect(queue[0]?.completed_at).toBeTruthy();
  });
});

describe("incrementRetry / pruneQueue / restoreQueue", () => {
  it("incrementRetry 复位为 pending 并累加重试次数", () => {
    const job = makeJob("a.md");
    const failed = updateJobStatus([job], job.id, "failed");
    expect(failed[0]?.status).toBe("failed"); // 前置状态，防止 setup 空操作导致假阳性
    const retried = incrementRetry(failed, job.id);
    expect(retried[0]?.status).toBe("pending");
    expect(retried[0]?.retry_count).toBe(1);
    expect(retried[0]?.error).toBeNull();
  });

  it("pruneQueue 清理超期完成的旧任务，保留进行中的", () => {
    const old = {
      ...makeJob("old.md"),
      status: "done" as const,
      completed_at: Date.now() - 100_000,
    };
    const active = makeJob("active.md");
    const fresh = { ...makeJob("fresh.md"), status: "done" as const, completed_at: Date.now() };
    const queue = pruneQueue([old, active, fresh], Date.now() - 60_000);
    expect(queue.map((j) => j.source_path)).toEqual(["active.md", "fresh.md"]);
  });

  it("restoreQueue 将遗留 processing 任务恢复为 pending", () => {
    const job = makeJob("a.md");
    const processing = updateJobStatus([job], job.id, "processing");
    expect(processing[0]?.status).toBe("processing"); // 前置状态，防止 setup 空操作导致假阳性
    const restored = restoreQueue(processing);
    expect(restored[0]?.status).toBe("pending");
    expect(restored[0]?.progress).toBeNull();
    expect(restored[0]?.started_at).toBeNull();
  });
});
