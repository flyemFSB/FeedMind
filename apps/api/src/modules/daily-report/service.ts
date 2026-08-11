import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { desc, eq } from "drizzle-orm";
import { db, feeds, rssSources, scheduleTasks, videos } from "@feedmind/db";
import type { ScheduleTaskRow, VideoRow } from "@feedmind/db";
import type { ExtractFeed, ScheduleUpsert } from "@feedmind/contracts";
import { HttpError } from "../../lib/http.js";
import { logger } from "../../lib/logger.js";
import { resolveDataDir } from "../../lib/data-dir.js";
import { syncAll } from "../feeds/service.js";
import { dailyReportWorkflow } from "../../mastra/workflows/daily-report.js";
import { synthesizeNarration } from "./tts-service.js";
import { renderReportVideo } from "./render-service.js";
import { getMastra } from "./mastra-holder.js";
import { syncScheduleById } from "./schedule-sync.js";

function now(): string {
  return new Date().toISOString();
}

export async function listSchedules(): Promise<ScheduleTaskRow[]> {
  return db.select().from(scheduleTasks).orderBy(scheduleTasks.createdAt);
}

export async function getSchedule(id: string): Promise<ScheduleTaskRow> {
  const [row] = await db.select().from(scheduleTasks).where(eq(scheduleTasks.id, id)).limit(1);
  if (!row) throw new HttpError(404, "NOT_FOUND", "定时任务不存在");
  return row;
}

export async function upsertSchedule(id: string, input: ScheduleUpsert): Promise<ScheduleTaskRow> {
  const t = now();
  const [existing] = await db
    .select({ id: scheduleTasks.id })
    .from(scheduleTasks)
    .where(eq(scheduleTasks.id, id))
    .limit(1);

  const values = {
    name: input.name,
    cron: input.cron,
    timezone: input.timezone ?? "Asia/Shanghai",
    enabled: input.enabled ?? true,
    updatedAt: t,
  };

  if (existing) {
    await db.update(scheduleTasks).set(values).where(eq(scheduleTasks.id, id));
  } else {
    await db.insert(scheduleTasks).values({
      id,
      createdAt: t,
      lastRunAt: null,
      lastRunStatus: null,
      lastError: null,
      ...values,
    });
  }

  // 同步到 Mastra 调度器（进程未持有 Mastra 实例时跳过，如单测/独立调用）
  const mastra = getMastra();
  if (mastra) {
    try {
      await syncScheduleById(mastra, id);
    } catch (err) {
      logger.warn({ err, scheduleId: id }, "同步调度到 Mastra 失败");
    }
  }

  return getSchedule(id);
}

export async function listVideos(): Promise<VideoRow[]> {
  return db.select().from(videos).orderBy(desc(videos.createdAt));
}

async function getVideo(id: string): Promise<VideoRow> {
  const [row] = await db.select().from(videos).where(eq(videos.id, id)).limit(1);
  if (!row) throw new HttpError(404, "NOT_FOUND", "日报记录不存在");
  return row;
}

// 回写运行阶段（供 web 端展示进度）
async function updateStage(videoId: string, stage: string | null): Promise<void> {
  await db.update(videos).set({ stage, updatedAt: now() }).where(eq(videos.id, videoId));
}

// 读取产物文件供 web 端查看/播放；占位文件仅作为渲染失败的兜底
export async function getVideoFile(id: string): Promise<{ buffer: Buffer; name: string }> {
  const video = await getVideo(id);
  if (!video.filePath) throw new HttpError(404, "NOT_FOUND", "视频文件尚未生成");
  const buffer = await readFile(video.filePath);
  return { buffer, name: `${video.reportDate}.mp4` };
}

// 渲染失败时的兜底产物：写一个带标记的占位文件，避免日报无任何产物
async function writePlaceholderArtifact(runId: string): Promise<string> {
  const dir = resolve(resolveDataDir(), "videos", runId);
  await mkdir(dir, { recursive: true });
  const filePath = resolve(dir, "report.mp4");
  await writeFile(filePath, "FeedMind 日报占位产物（渲染失败兜底）", "utf8");
  return filePath;
}

// 读取最近抓入的 feeds 作为本日报提炼输入（join 来源名作为 source）
async function readRecentFeeds(limit = 20): Promise<ExtractFeed[]> {
  const rows = await db
    .select({
      id: feeds.id,
      title: feeds.title,
      link: feeds.link,
      description: feeds.description,
      source: rssSources.title,
    })
    .from(feeds)
    .leftJoin(rssSources, eq(feeds.sourceId, rssSources.id))
    .orderBy(desc(feeds.fetchedAt))
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

// scheduleId → 本次运行将返回的 running 记录 Promise。在途期间（含记录尚未插入的瞬间）并发触发
// 复用同一 Promise，拿到同一 running 记录，绝不重复启动管线；管线结束后从表移除。
const inFlight = new Map<string, Promise<VideoRow>>();

/**
 * 一次日报运行入口：建 running 记录后立即返回，管线在后台执行（真实抓取/LLM 可能耗时数分钟，
 * 不能阻塞 HTTP 触发请求）。同一 schedule 在途时幂等返回当前 running 记录。
 */
export async function triggerReport(scheduleId: string): Promise<VideoRow> {
  await getSchedule(scheduleId);

  const existing = inFlight.get(scheduleId);
  if (existing) return existing;

  // 先登记 deferred 再建记录：并发的第二次触发 await 到同一个 running 记录
  const pending = startRun(scheduleId);
  inFlight.set(scheduleId, pending);
  void pending
    .then((video) => {
      void runPipeline(video.id, scheduleId);
    })
    .catch((err) => {
      // startRun 失败（如 DB 写入异常）：清掉在途标记，错误由 triggerReport 的 await 抛给调用方
      inFlight.delete(scheduleId);
      logger.error({ scheduleId, err }, "创建日报运行记录失败");
    });

  return pending;
}

async function startRun(scheduleId: string): Promise<VideoRow> {
  const t = now();
  const videoId = randomUUID();

  await db.insert(videos).values({
    id: videoId,
    scheduleId,
    reportDate: t.slice(0, 10),
    status: "running",
    filePath: null,
    duration: null,
    error: null,
    createdAt: t,
    updatedAt: t,
  });
  await db
    .update(scheduleTasks)
    .set({ lastRunAt: t, lastRunStatus: "running", lastError: null, updatedAt: t })
    .where(eq(scheduleTasks.id, scheduleId));

  return getVideo(videoId);
}

async function runPipeline(videoId: string, scheduleId: string): Promise<void> {
  let status: VideoRow["status"] = "success";
  let error: string | null = null;
  let filePath: string | null = null;
  let duration: number | null = null;

  try {
    // 先抓取全部订阅源增量（syncAll 逐源容错，不会整体抛错），再以最近条目作为提炼输入
    await updateStage(videoId, "sync");
    const syncResult = await syncAll();
    logger.info({ scheduleId, runId: videoId, syncResult }, "日报抓取完成");
    const inputFeeds = await readRecentFeeds();

    await updateStage(videoId, "extract");
    const run = await dailyReportWorkflow.createRun();
    const result = await run.start({
      inputData: { runId: videoId, scheduleId, feeds: inputFeeds },
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
      try {
        const narration = await synthesizeNarration(result.result.script, outDir);
        logger.info({ audioPath: narration.audioPath, srtPath: narration.srtPath }, "日报配音完成");
      } catch (err) {
        logger.warn({ err }, "日报配音异常");
      }
      await updateStage(videoId, "render");
      // 渲染（Remotion；浏览器/字体不可用时回退占位文件）
      try {
        const rendered = await renderReportVideo(result.result.script, outDir);
        filePath = rendered.videoPath;
        duration = Math.round(rendered.durationSec);
      } catch (err) {
        logger.warn({ err }, "Remotion 渲染失败，写入占位产物");
        filePath = await writePlaceholderArtifact(videoId);
        duration = 0;
      }
    }
  } catch (err) {
    status = "failed";
    error = err instanceof Error ? err.message : String(err);
  } finally {
    inFlight.delete(scheduleId);
  }

  const t = now();
  await db
    .update(videos)
    .set({ status, stage: null, filePath, duration, error, updatedAt: t })
    .where(eq(videos.id, videoId));
  await db
    .update(scheduleTasks)
    .set({ lastRunStatus: status, lastError: error, updatedAt: t })
    .where(eq(scheduleTasks.id, scheduleId));

  if (status === "failed") {
    logger.error({ scheduleId, runId: videoId, error }, "日报运行失败");
  } else {
    logger.info({ scheduleId, runId: videoId, status, error }, "日报运行结束");
  }
}
