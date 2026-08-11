import type { Mastra } from "@mastra/core";
import { eq } from "drizzle-orm";
import { db, scheduleTasks } from "@feedmind/db";
import type { ScheduleTaskRow } from "@feedmind/db";
import { logger } from "../../lib/logger.js";

// 定时调度由 Mastra schedules 承担；本模块把 schedule_tasks（用户配置的记账/UI）镜像到 mastra.schedules。
const RUN_WORKFLOW_ID = "daily-report-run";

const mastraId = (scheduleId: string) => `schedule_${scheduleId}`;

// 窄接口：便于单测传入 fake 调度目标，避免依赖真实 Mastra 实例
export interface ScheduleSyncTarget {
  schedules: {
    create(input: {
      id?: string;
      workflowId: string;
      cron: string;
      timezone?: string;
      inputData?: unknown;
      status?: "active" | "paused";
    }): Promise<unknown>;
    update(
      id: string,
      patch: {
        cron?: string;
        timezone?: string;
        inputData?: unknown;
        status?: "active" | "paused";
      },
    ): Promise<unknown>;
    delete(id: string): Promise<void>;
  };
}

// 单个 schedule_tasks 行 → Mastra 调度：无行=删除；enabled=true=active；enabled=false=paused
export async function syncScheduleToMastra(
  target: ScheduleSyncTarget,
  scheduleId: string,
  schedule: ScheduleTaskRow | null,
): Promise<void> {
  const id = mastraId(scheduleId);

  if (!schedule) {
    await target.schedules
      .delete(id)
      .catch((err) => logger.warn({ err, scheduleId }, "删除 Mastra 调度失败"));
    return;
  }

  const patch = {
    cron: schedule.cron,
    timezone: schedule.timezone,
    inputData: { scheduleId },
    status: schedule.enabled ? ("active" as const) : ("paused" as const),
  };

  try {
    // id 传 scheduleId，由 Mastra 归一化为 schedule_<scheduleId>
    await target.schedules.create({ id: scheduleId, workflowId: RUN_WORKFLOW_ID, ...patch });
  } catch {
    // 已存在：走 update 覆盖 cron/timezone/inputData/status
    await target.schedules.update(id, patch);
  }
}

/** 按 id 读取 schedule_tasks 后同步（供服务层 upsert 后调用） */
export async function syncScheduleById(
  target: ScheduleSyncTarget,
  scheduleId: string,
): Promise<void> {
  const [row] = await db
    .select()
    .from(scheduleTasks)
    .where(eq(scheduleTasks.id, scheduleId))
    .limit(1);
  await syncScheduleToMastra(target, scheduleId, row ?? null);
}

export async function syncAllSchedules(target: ScheduleSyncTarget): Promise<void> {
  const rows = await db.select().from(scheduleTasks);
  for (const row of rows) {
    try {
      await syncScheduleToMastra(target, row.id, row);
    } catch (err) {
      logger.error({ err, scheduleId: row.id }, "同步调度失败");
    }
  }
}

/** 启动 Mastra 调度器（SchedulerWorker）+ 把现有 schedule_tasks 镜像进去。单实例运行，避免重复触发。 */
export async function startDailyReportScheduler(mastra: Mastra): Promise<void> {
  // 1.55.0 的 SchedulerWorker 随 startWorkers() 全量启动（无独立 "scheduler" 名字），
  // scheduler: { enabled: true } 保证 #shouldEnableScheduler() 为真
  await mastra.startWorkers();
  await syncAllSchedules(mastra);
  logger.info("日报调度器（Mastra schedules）已启动");
}
