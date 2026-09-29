import type { Mastra } from "@mastra/core";
import { eq } from "drizzle-orm";
import { db, setting } from "@feedmind/db";
import { logger } from "../../lib/logger.js";

// 定时调度由 Mastra schedules 承担；日报调度是单例配置，本模块把它镜像到 mastra.schedules。
const RUN_WORKFLOW_ID = "daily-report-run";

/** 日报调度的固定标识（单例，不再有用户自定义 id） */
export const REPORT_SCHEDULE_ID = "daily-report";

const mastraId = (scheduleId: string) => `schedule_${scheduleId}`;

export interface ReportScheduleConfig {
  name: string;
  cron: string;
  timezone: string;
  enabled: boolean;
}

/** 读取单例调度配置；未保存时返回 null */
export async function readScheduleConfig(): Promise<ReportScheduleConfig | null> {
  const [row] = await db
    .select({ value: setting.value })
    .from(setting)
    .where(eq(setting.key, "report_schedule"))
    .limit(1);
  return (row?.value as ReportScheduleConfig | undefined) ?? null;
}

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

/** 调度配置 → Mastra 调度：null=删除；enabled=true=active；enabled=false=paused */
export async function syncScheduleToMastra(
  target: ScheduleSyncTarget,
  scheduleId: string,
  schedule: ReportScheduleConfig | null,
): Promise<void> {
  const id = mastraId(scheduleId);

  if (!schedule) {
    await target.schedules
      .delete(id)
      .catch((err) => logger.warn({ err, scheduleId }, "删除 Mastra 定时调度任务失败"));
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

/** 读取单例调度配置后同步（供服务层保存后调用） */
export async function syncScheduleById(target: ScheduleSyncTarget): Promise<void> {
  const schedule = await readScheduleConfig();
  await syncScheduleToMastra(target, REPORT_SCHEDULE_ID, schedule);
}

/** 启动时同步一次（Mastra 调度表是投影，只写不读） */
export async function syncAllSchedules(mastra: Mastra): Promise<void> {
  await syncScheduleById(mastra as unknown as ScheduleSyncTarget);
}

/** 启动 Mastra 调度器并同步投影 */
export async function startScheduler(mastra: Mastra): Promise<void> {
  // 1.55.0 的 SchedulerWorker 随 startWorkers() 全量启动（无独立 "scheduler" 名字），
  // scheduler: { enabled: true } 保证 #shouldEnableScheduler() 为真
  await mastra.startWorkers();
  await syncAllSchedules(mastra);
  logger.info("日报定时调度器已启动");
}
