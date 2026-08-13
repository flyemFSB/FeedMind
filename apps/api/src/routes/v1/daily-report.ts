import { Hono } from "hono";
import { scheduleUpsertSchema, triggerReportSchema } from "@feedmind/contracts";
import { jsonError, jsonOk, parseJson } from "../../lib/http.js";
import { logger } from "../../lib/logger.js";
import {
  listSchedules,
  upsertSchedule,
  listVideos,
  triggerReport,
  getVideoFile,
} from "../../modules/daily-report/service.js";

export const dailyReportRoutes = new Hono();

// 定时任务列表（web 日报页设置区）
dailyReportRoutes.get("/daily-report/schedules", async (c) => jsonOk(c, await listSchedules()));

// 定时任务创建/更新（不存在则插入，存在则覆盖 cron/enabled 等）
dailyReportRoutes.put("/daily-report/schedules/:id", async (c) => {
  const payload = await parseJson(c, scheduleUpsertSchema);
  return jsonOk(c, await upsertSchedule(c.req.param("id"), payload));
});

// 手动触发一次日报（与定时触发共用 triggerReport 入口）
dailyReportRoutes.post("/daily-report/trigger", async (c) => {
  const payload = await parseJson(c, triggerReportSchema);
  return jsonOk(c, await triggerReport(payload.scheduleId));
});

dailyReportRoutes.get("/daily-report/videos", async (c) => jsonOk(c, await listVideos()));

// 产物文件（web 查看/播放；占位阶段为标记文件）
dailyReportRoutes.get("/daily-report/videos/:id/file", async (c) => {
  try {
    const file = await getVideoFile(c.req.param("id"));
    return new Response(file.buffer, {
      headers: {
        "content-type": "video/mp4",
        "content-disposition": `inline; filename="${file.name}"`,
      },
    });
  } catch (err) {
    const notFound =
      err instanceof Error && "status" in err && (err as { status: number }).status === 404;
    logger.error({ err, videoId: c.req.param("id") }, "读取日报视频失败");
    return jsonError(
      c,
      notFound ? 404 : 500,
      "VIDEO_FILE_ERROR",
      // 不向用户透传 fs 内部错误（ENOENT 等英文路径信息）
      notFound ? "视频文件不存在或已删除" : "视频文件读取失败，请重试",
      {},
      notFound ? { key: "apiError.videoFileNotFound" } : { key: "apiError.videoFileReadFailed" },
    );
  }
});
