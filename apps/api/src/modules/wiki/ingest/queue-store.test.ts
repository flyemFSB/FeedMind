import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let dir: string;

// WIKI_DIR 指向独立临时目录；每次 loadStore 重置模块加载，模拟进程重启后的全新单例
async function loadStore() {
  vi.resetModules();
  process.env["WIKI_DIR"] = dir;
  const mod = await import("./queue-store.js");
  return mod.getQueueStore();
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "feedmind-queue-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.resetModules();
  delete process.env["WIKI_DIR"];
});

describe("JsonQueueStore", () => {
  it("入队后 nextPending 命中，标记 processing 后不再被抢占", async () => {
    const store = await loadStore();
    const job = store.enqueue("sp-1", "raw/sources/a.md", "folder", "标题A");

    expect(store.nextPending("sp-1")?.id).toBe(job.id);
    store.updateStatus("sp-1", job.id, "processing", {
      progress: { message: "处理中", step: 1, totalSteps: 3 },
    });
    expect(store.nextPending("sp-1")).toBeNull();
    // 进度已写入
    expect(store.list("sp-1")[0]?.progress).toEqual({ message: "处理中", step: 1, totalSteps: 3 });
  });

  it("崩溃恢复：遗留 processing 任务重启后重置为 pending，且只恢复一次", async () => {
    const store = await loadStore();
    const job = store.enqueue("sp-1", "raw/sources/a.md");
    store.updateStatus("sp-1", job.id, "processing");

    // 模拟重启：全新单例读取同一队列文件
    const restarted = await loadStore();
    expect(restarted.list("sp-1")[0]?.status).toBe("pending");

    // 恢复只执行一次：重启后再次置为 processing，不会在下一次读取被抹掉进度
    restarted.updateStatus("sp-1", job.id, "processing", {
      progress: { message: "处理中", step: 2, totalSteps: 3 },
    });
    expect(restarted.list("sp-1")[0]?.status).toBe("processing");
    expect(restarted.list("sp-1")[0]?.progress).toEqual({
      message: "处理中",
      step: 2,
      totalSteps: 3,
    });
  });

  it("retry 递增重试次数，remove 删除任务", async () => {
    const store = await loadStore();
    const job = store.enqueue("sp-1", "raw/sources/a.md");
    store.updateStatus("sp-1", job.id, "failed", { error: "boom" });
    store.retry("sp-1", job.id);

    const retried = store.list("sp-1")[0];
    expect(retried?.status).toBe("pending");
    expect(retried?.retry_count).toBe(1);

    store.remove("sp-1", job.id);
    expect(store.list("sp-1")).toHaveLength(0);
  });

  it("不同空间队列互不干扰", async () => {
    const store = await loadStore();
    store.enqueue("sp-1", "raw/sources/a.md");
    store.enqueue("sp-2", "raw/sources/b.md");
    expect(store.nextPending("sp-1")?.source_path).toBe("raw/sources/a.md");
    expect(store.nextPending("sp-2")?.source_path).toBe("raw/sources/b.md");
  });

  it("多个文件同时入队时，前一个任务完成（无论成功还是失败）后均能依次取出下一个", async () => {
    const store = await loadStore();
    const job1 = store.enqueue("sp-1", "raw/sources/doc1.md", undefined, "Doc 1");
    const job2 = store.enqueue("sp-1", "raw/sources/doc2.md", undefined, "Doc 2");
    const job3 = store.enqueue("sp-1", "raw/sources/doc3.md", undefined, "Doc 3");

    // 1. 取出并处理 job1（模拟失败）
    const next1 = store.nextPending("sp-1");
    expect(next1?.id).toBe(job1.id);
    store.updateStatus("sp-1", job1.id, "processing");
    store.updateStatus("sp-1", job1.id, "failed", { error: "something went wrong" });

    // 2. 取出并处理 job2（模拟成功）
    const next2 = store.nextPending("sp-1");
    expect(next2?.id).toBe(job2.id);
    store.updateStatus("sp-1", job2.id, "processing");
    store.updateStatus("sp-1", job2.id, "done", { pages_created: 2 });

    // 3. 取出并处理 job3（模拟成功）
    const next3 = store.nextPending("sp-1");
    expect(next3?.id).toBe(job3.id);
    store.updateStatus("sp-1", job3.id, "processing");
    store.updateStatus("sp-1", job3.id, "done", { pages_created: 1 });

    // 4. 队列全部处理完毕
    expect(store.nextPending("sp-1")).toBeNull();
    const list = store.list("sp-1");
    expect(list.find((j) => j.id === job1.id)?.status).toBe("failed");
    expect(list.find((j) => j.id === job2.id)?.status).toBe("done");
    expect(list.find((j) => j.id === job3.id)?.status).toBe("done");
  });
});
