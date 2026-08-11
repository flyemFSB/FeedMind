import { describe, expect, it, vi } from "vitest";
import type { ScheduleTaskRow } from "@feedmind/db";
import { syncScheduleToMastra } from "./schedule-sync.js";

function makeRow(overrides: Partial<ScheduleTaskRow> = {}): ScheduleTaskRow {
  return {
    id: "daily-video",
    name: "每日日报",
    cron: "0 8 * * *",
    timezone: "Asia/Shanghai",
    enabled: true,
    lastRunAt: null,
    lastRunStatus: null,
    lastError: null,
    createdAt: "2026-08-09T00:00:00.000Z",
    updatedAt: "2026-08-09T00:00:00.000Z",
    ...overrides,
  };
}

function fakeTarget() {
  return {
    schedules: {
      create: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    },
  };
}

describe("syncScheduleToMastra", () => {
  it("启用行 → create(active)，id 走 schedule_ 归一化", async () => {
    const target = fakeTarget();
    await syncScheduleToMastra(target, "daily-video", makeRow());
    expect(target.schedules.create).toHaveBeenCalledWith({
      id: "daily-video",
      workflowId: "daily-report-run",
      cron: "0 8 * * *",
      timezone: "Asia/Shanghai",
      inputData: { scheduleId: "daily-video" },
      status: "active",
    });
  });

  it("禁用行 → status paused", async () => {
    const target = fakeTarget();
    await syncScheduleToMastra(target, "daily-video", makeRow({ enabled: false }));
    expect(target.schedules.create.mock.calls[0]?.[0]?.status).toBe("paused");
  });

  it("已存在（create 抛错）→ update 覆盖 cron/status", async () => {
    const target = fakeTarget();
    target.schedules.create.mockRejectedValueOnce(new Error("duplicate"));
    await syncScheduleToMastra(target, "daily-video", makeRow({ cron: "0 9 * * *" }));
    expect(target.schedules.update).toHaveBeenCalledWith(
      "schedule_daily-video",
      expect.objectContaining({ cron: "0 9 * * *", status: "active" }),
    );
  });

  it("无行 → delete 清理对应调度", async () => {
    const target = fakeTarget();
    await syncScheduleToMastra(target, "daily-video", null);
    expect(target.schedules.delete).toHaveBeenCalledWith("schedule_daily-video");
  });
});
