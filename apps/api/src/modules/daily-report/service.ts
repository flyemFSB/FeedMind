import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { desc, eq } from "drizzle-orm";
import { db, feedItem, reportRun, setting, source, type ReportRunRow } from "@feedmind/db";
import type { ExtractFeed, ScheduleUpsert } from "@feedmind/contracts";
import { HttpError } from "../../lib/http.js";
import { logger } from "../../lib/logger.js";
import { resolveDataDir } from "../../lib/data-dir.js";
import { syncAll } from "../feeds/service.js";
import { dailyReportWorkflow } from "../../mastra/workflows/daily-report/index.js";
import { synthesizeNarration } from "./tts-service.js";
import { renderReportVideo, type RenderStage } from "./render-service.js";
import type { VideoTimeline } from "./timeline.js";
import { getMastra } from "../../mastra/holder.js";
import { REPORT_SCHEDULE_ID, readScheduleConfig, syncScheduleById } from "./schedule-sync.js";

function now(): string {
  return new Date().toISOString();
}

/** 调度配置的对外形状：单例 + 最新一次运行的派生状态（保持前端契约不变） */
export interface ScheduleTaskRead {
  id: string;
  name: string;
  cron: string;
  timezone: string;
  enabled: boolean;
  lastRunAt: string | null;
  lastRunStatus: "running" | "success" | "failed" | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 日报运行的对外形状 */
export interface ReportVideoRead {
  id: string;
  scheduleId: string;
  reportDate: string;
  status: "running" | "success" | "failed";
  stage: string | null;
  filePath: string | null;
  duration: number | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 未保存过的默认调度：关闭状态，用户在前端保存后生效 */
const DEFAULT_SCHEDULE = {
  name: "每日日报",
  cron: "0 8 * * *",
  timezone: "Asia/Shanghai",
  enabled: false,
} as const;

async function readSettingUpdatedAt(): Promise<string> {
  const [row] = await db
    .select({ updatedAt: setting.updatedAt })
    .from(setting)
    .where(eq(setting.key, "report_schedule"))
    .limit(1);
  return row?.updatedAt ?? now();
}

export async function getSchedule(): Promise<ScheduleTaskRead> {
  const [config, latest] = await Promise.all([
    readScheduleConfig(),
    db.select().from(reportRun).orderBy(desc(reportRun.createdAt)).limit(1),
  ]);
  const last = latest[0];

  return {
    id: REPORT_SCHEDULE_ID,
    name: config?.name ?? DEFAULT_SCHEDULE.name,
    cron: config?.cron ?? DEFAULT_SCHEDULE.cron,
    timezone: config?.timezone ?? DEFAULT_SCHEDULE.timezone,
    enabled: config?.enabled ?? DEFAULT_SCHEDULE.enabled,
    lastRunAt: last?.createdAt ?? null,
    lastRunStatus: (last?.status as ScheduleTaskRead["lastRunStatus"]) ?? null,
    lastError: last?.error ?? null,
    createdAt: await readSettingUpdatedAt(),
    updatedAt: await readSettingUpdatedAt(),
  };
}

/** 单元素数组：前端按列表渲染，契约保持不变 */
export async function listSchedules(): Promise<ScheduleTaskRead[]> {
  return [await getSchedule()];
}

export async function upsertSchedule(input: ScheduleUpsert): Promise<ScheduleTaskRead> {
  const current = await readScheduleConfig();
  const value = {
    name: input.name,
    cron: input.cron,
    timezone: input.timezone ?? current?.timezone ?? DEFAULT_SCHEDULE.timezone,
    enabled: input.enabled ?? current?.enabled ?? DEFAULT_SCHEDULE.enabled,
  };

  const updatedAt = now();
  await db
    .insert(setting)
    .values({ key: "report_schedule", value, updatedAt })
    .onConflictDoUpdate({ target: setting.key, set: { value, updatedAt } });

  // 同步到 Mastra 调度器（进程未持有 Mastra 实例时跳过，如单测/独立调用）
  const mastra = getMastra();
  if (mastra) {
    try {
      await syncScheduleById(mastra);
    } catch (err) {
      logger.warn({ err }, "同步定时任务到调度引擎失败");
    }
  }

  return getSchedule();
}

function toVideoRead(row: ReportRunRow): ReportVideoRead {
  return {
    id: row.id,
    scheduleId: REPORT_SCHEDULE_ID,
    reportDate: row.reportDate,
    status: row.status as ReportVideoRead["status"],
    stage: row.stage,
    filePath: row.videoPath,
    duration: row.durationSec,
    error: row.error,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listVideos(): Promise<ReportVideoRead[]> {
  const rows = await db.select().from(reportRun).orderBy(desc(reportRun.createdAt));
  return rows.map(toVideoRead);
}

async function getVideo(id: string): Promise<ReportRunRow> {
  const [row] = await db.select().from(reportRun).where(eq(reportRun.id, id)).limit(1);
  if (!row)
    throw new HttpError(
      404,
      "NOT_FOUND",
      "日报记录不存在",
      {},
      { i18nKey: "apiError.reportNotFound" },
    );
  return row;
}

// 回写运行阶段（供 web 端展示进度）。
// stage 允许 `render/bundling:42%` 这类细粒度进度串，故不限定枚举。
async function updateStage(videoId: string, stage: string): Promise<void> {
  await db.update(reportRun).set({ stage, updatedAt: now() }).where(eq(reportRun.id, videoId));
}

// 读取产物文件供 web 端查看/播放
export async function getVideoFile(id: string): Promise<{ buffer: Buffer; name: string }> {
  const video = await getVideo(id);
  if (!video.videoPath)
    throw new HttpError(
      404,
      "NOT_FOUND",
      "视频文件尚未生成",
      {},
      { i18nKey: "apiError.videoNotReady" },
    );
  const buffer = await readFile(video.videoPath);
  return { buffer, name: `${video.reportDate}.mp4` };
}

// 读取最近抓入的条目作为本日报提炼输入（join 来源名作为 source）
async function readRecentFeeds(limit = 20): Promise<ExtractFeed[]> {
  const rows = await db
    .select({
      id: feedItem.id,
      title: feedItem.title,
      link: feedItem.url,
      description: feedItem.summary,
      source: source.title,
    })
    .from(feedItem)
    .leftJoin(source, eq(feedItem.sourceId, source.id))
    .orderBy(desc(feedItem.createdAt))
    .limit(limit);

  return rows
    .filter(
      (r): r is (typeof rows)[number] & { link: string } => r.link != null && r.link.length > 0,
    )
    .map((r) => ({
      id: r.id,
      title: r.title,
      link: r.link,
      description: r.description,
      source: r.source ?? "未知来源",
    }));
}

// 在途标记：并发触发时复用同一 Promise，绝不重复启动管线；管线结束后移除
let inFlight: Promise<ReportVideoRead> | null = null;

/**
 * 一次日报运行入口：建 running 记录后立即返回，管线在后台执行（真实抓取/LLM 可能耗时数分钟，
 * 不能阻塞 HTTP 触发请求）。在途时幂等返回当前 running 记录。
 */
export async function triggerReport(scheduleId: string): Promise<ReportVideoRead> {
  if (scheduleId !== REPORT_SCHEDULE_ID) {
    throw new HttpError(
      404,
      "NOT_FOUND",
      "定时任务不存在",
      {},
      {
        i18nKey: "apiError.scheduleNotFound",
      },
    );
  }
  if (inFlight) return inFlight;

  const t = now();
  const videoId = randomUUID();

  const [created] = await db
    .insert(reportRun)
    .values({
      id: videoId,
      reportDate: t.slice(0, 10),
      status: "running",
      videoPath: null,
      durationSec: null,
      error: null,
    })
    .returning();

  const run = runPipeline(videoId)
    .catch((err) => {
      logger.error({ err, runId: videoId }, "日报管线异常结束");
      return toVideoRead({ ...created!, status: "failed", error: String(err) });
    })
    .finally(() => {
      inFlight = null;
    });
  inFlight = run;

  return toVideoRead(created!);
}

async function runPipeline(videoId: string): Promise<ReportVideoRead> {
  let status: ReportRunRow["status"] = "success";
  let error: string | null = null;
  let filePath: string | null = null;
  let duration: number | null = null;

  try {
    // 先抓取全部订阅源增量（syncAll 逐源容错，不会整体抛错），再以最近条目作为提炼输入
    await updateStage(videoId, "sync");
    const syncResult = await syncAll();
    logger.info({ runId: videoId, syncResult }, "日报源内容同步完成");
    const inputFeeds = await readRecentFeeds();

    await updateStage(videoId, "extract");
    const run = await dailyReportWorkflow.createRun();
    const result = await run.start({
      inputData: { runId: videoId, scheduleId: REPORT_SCHEDULE_ID, feeds: inputFeeds },
    });
    if (result.status !== "success") {
      status = "failed";
      error =
        result.status === "failed"
          ? (result.error?.message ?? "workflow 运行失败")
          : `运行中止：${result.status}`;
    } else {
      const outDir = resolve(resolveDataDir(), "videos", videoId);
      await updateStage(videoId, "tts");
      // 配音（Fish → edge-tts 双源降级；全失败写占位音频，不阻断管线）
      let narrationTimeline: VideoTimeline | undefined;
      let narrationCues: Awaited<ReturnType<typeof synthesizeNarration>>["cues"] = [];
      try {
        const narration = await synthesizeNarration(result.result.script, outDir);
        narrationTimeline = narration.timeline;
        narrationCues = narration.cues;
        logger.info(
          { totalFrames: narration.timeline.totalFrames, cueCount: narration.cues.length },
          "日报配音与实测时间轴构建完成",
        );
      } catch (err) {
        logger.warn({ err }, "日报配音生成异常");
      }
      await updateStage(videoId, "render");
      // 渲染（Remotion）；把细粒度阶段写回 report_run.stage 让前端可显示粗进度。
      // 失败交给外层 catch 统一置 failed，不产出占位文件——浏览器播放非 mp4 只会显示加载失败
      try {
        const rendered = await renderReportVideo(
          result.result.script,
          outDir,
          narrationTimeline,
          { cues: narrationCues },
          {
            onStage: (stage: RenderStage, progress?: number) => {
              const detail = typeof progress === "number" ? `:${Math.round(progress * 100)}%` : "";
              void updateStage(videoId, `render/${stage}${detail}`);
            },
          },
        );
        filePath = rendered.videoPath;
        duration = Math.round(rendered.durationSec);
      } catch (err) {
        logger.warn({ err, runId: videoId }, "视频渲染失败，标记任务状态为失败");
        throw err;
      }
    }
  } catch (err) {
    status = "failed";
    error = err instanceof Error ? err.message : String(err);
  }

  const t = now();
  const [row] = await db
    .update(reportRun)
    .set({
      status,
      stage: null,
      videoPath: filePath,
      durationSec: duration,
      error,
      finishedAt: t,
      updatedAt: t,
    })
    .where(eq(reportRun.id, videoId))
    .returning();

  return toVideoRead(row!);
}
