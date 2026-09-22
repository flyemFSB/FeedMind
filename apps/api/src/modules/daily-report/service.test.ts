import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestDb, type TestDbContext } from "../../test-utils.js";

// 焦点：定时任务与视频记录的 DB 契约（含 404 与产物文件读取）
async function loadService() {
  return import("./service.js");
}
type ServiceModule = Awaited<ReturnType<typeof loadService>>;

let ctx: TestDbContext;
let service: ServiceModule;
let dir: string;

beforeEach(async () => {
  vi.resetModules();
  dir = mkdtempSync(join(tmpdir(), "feedmind-daily-report-"));
  ctx = await createTestDb({ seedDefaults: false });
  service = await loadService();
});

afterEach(async () => {
  await ctx.cleanup();
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* 临时目录残留无害 */
  }
});

/** videos.schedule_id 有外键约束，插入视频前必须先有对应的定时任务 */
async function seedSchedule(id = "daily-video"): Promise<void> {
  await ctx.dbMod.db.insert(ctx.dbMod.scheduleTasks).values({
    id,
    name: "每日日报",
    cron: "0 8 * * *",
  });
}

describe("定时任务读写", () => {
  it("空库返回空列表", async () => {
    expect(await service.listSchedules()).toEqual([]);
  });

  it("首次写入时补默认时区与启用状态", async () => {
    const row = await service.upsertSchedule("daily-video", {
      name: "每日日报",
      cron: "0 8 * * *",
    });

    expect(row.timezone).toBe("Asia/Shanghai");
    expect(row.enabled).toBe(true);
    expect(row.lastRunAt).toBeNull();
  });

  it("同 id 重复写入是更新而不是新增", async () => {
    await service.upsertSchedule("daily-video", { name: "旧", cron: "0 8 * * *" });
    const updated = await service.upsertSchedule("daily-video", {
      name: "新",
      cron: "0 9 * * *",
      enabled: false,
    });

    expect(updated.name).toBe("新");
    expect(updated.cron).toBe("0 9 * * *");
    expect(updated.enabled).toBe(false);
    expect(await service.listSchedules()).toHaveLength(1);
  });

  it("读取不存在的定时任务抛 404 NOT_FOUND", async () => {
    await expect(service.getSchedule("missing")).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    });
  });

  it("创建后可读回", async () => {
    await service.upsertSchedule("daily-video", { name: "每日日报", cron: "0 8 * * *" });
    expect((await service.getSchedule("daily-video")).name).toBe("每日日报");
  });
});

describe("视频记录", () => {
  it("空库返回空列表", async () => {
    expect(await service.listVideos()).toEqual([]);
  });

  it("记录不存在时读取产物抛 404", async () => {
    await expect(service.getVideoFile("missing")).rejects.toMatchObject({ status: 404 });
  });

  it("记录存在但尚未产出文件时报视频未就绪", async () => {
    await seedSchedule();
    await ctx.dbMod.db.insert(ctx.dbMod.videos).values({
      id: "v1",
      scheduleId: "daily-video",
      reportDate: "2026-08-09",
      status: "running",
    });

    await expect(service.getVideoFile("v1")).rejects.toMatchObject({ status: 404 });
  });

  it("产物已生成时读出文件内容，文件名取日报日期", async () => {
    await seedSchedule();
    const filePath = join(dir, "report.mp4");
    writeFileSync(filePath, Buffer.from([1, 2, 3, 4]));
    await ctx.dbMod.db.insert(ctx.dbMod.videos).values({
      id: "v1",
      scheduleId: "daily-video",
      reportDate: "2026-08-09",
      status: "success",
      filePath,
    });

    const { buffer, name } = await service.getVideoFile("v1");
    expect(name).toBe("2026-08-09.mp4");
    expect([...buffer]).toEqual([1, 2, 3, 4]);
  });
});

describe("triggerReport", () => {
  it("定时任务不存在时抛 404，且不创建视频记录", async () => {
    await expect(service.triggerReport("missing")).rejects.toMatchObject({ status: 404 });
    expect(await service.listVideos()).toEqual([]);
  });
});
