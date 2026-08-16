"use client";

import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { CalendarDays, Play, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { MotionSpinner } from "@/components/ui/motion-spinner";
import { toast } from "@/components/ui/toast";
import {
  useDailyReportSchedules,
  useDailyReportVideos,
  useUpsertSchedule,
  useTriggerReport,
} from "@/lib/hooks/use-daily-report";
import { videoFileUrl, type ReportVideo, type ScheduleTask } from "@/lib/api/daily-report";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/daily-report/")({
  component: DailyReportPage,
});

// 单一"每日日报"任务（固定 id；多任务支持暂未实现）
const SCHEDULE_ID = "daily-video";
const DEFAULT_CRON = "0 8 * * *";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  success: "default",
  running: "secondary",
  failed: "destructive",
};

function DailyReportPage() {
  const { t } = useTranslation();
  const { data: schedules = [], isLoading: schedulesLoading } = useDailyReportSchedules();
  const { data: videos = [], isLoading: videosLoading } = useDailyReportVideos();
  const upsertMutation = useUpsertSchedule();
  const triggerMutation = useTriggerReport();

  // 用户编辑时进入本地草稿；未编辑时回显已有任务的值
  const schedule: ScheduleTask | undefined = schedules[0];
  const [draft, setDraft] = useState<{ cron: string; enabled: boolean } | null>(null);
  const cron = draft?.cron ?? schedule?.cron ?? DEFAULT_CRON;
  const enabled = draft?.enabled ?? schedule?.enabled ?? true;

  const handleSave = async () => {
    try {
      await upsertMutation.mutateAsync({
        id: SCHEDULE_ID,
        body: { name: t("dailyReport.taskName"), cron, enabled },
      });
      setDraft(null);
      toast.add({ title: t("dailyReport.saved"), type: "success" });
    } catch {
      // apiFetch 已 toast 错误
    }
  };

  const handleTrigger = async () => {
    try {
      const video = await triggerMutation.mutateAsync(schedule?.id ?? SCHEDULE_ID);
      // 触发后返回 running 记录，管线后台执行；成功/失败由列表状态回显
      const title =
        video.status === "running"
          ? t("dailyReport.triggerStarted")
          : video.status === "success"
            ? t("dailyReport.triggered")
            : t("dailyReport.triggerFailed");
      toast.add({
        title,
        type: video.status === "failed" ? "warning" : "success",
      });
    } catch {
      // apiFetch 已 toast 错误
    }
  };

  const statusLabel = (status: string) => t(`dailyReport.status.${status}`);

  return (
    <div className="mx-auto max-w-[1080px] space-y-4 px-6 pt-6 pb-6 max-sm:px-4">
      <section className="rounded-lg border border-editorial-hairline bg-editorial-surface-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <CalendarDays size={16} className="text-editorial-ink-muted" />
          <h2 className="text-[14px] font-semibold text-editorial-ink">
            {t("dailyReport.schedule")}
          </h2>
          {schedule?.lastRunStatus && (
            <Badge
              variant={STATUS_VARIANT[schedule.lastRunStatus] ?? "secondary"}
              className="ml-auto"
            >
              {statusLabel(schedule.lastRunStatus)}
            </Badge>
          )}
        </div>

        {schedulesLoading ? (
          <Skeleton className="h-8 w-full" />
        ) : (
          <div className="space-y-3">
            <label className="flex items-center justify-between gap-4 text-[13px]">
              <span className="text-editorial-ink-soft">{t("dailyReport.cronLabel")}</span>
              <input
                value={cron}
                onChange={(e) => setDraft((d) => ({ ...(d ?? { enabled }), cron: e.target.value }))}
                placeholder={DEFAULT_CRON}
                className="w-56 rounded-lg border border-editorial-hairline-strong bg-editorial-surface-card px-3 py-1.5 text-[13px] text-editorial-ink outline-none focus:border-editorial-accent focus:ring-2 focus:ring-editorial-accent-soft"
              />
            </label>
            <label className="flex items-center justify-between gap-4 text-[13px]">
              <span className="text-editorial-ink-soft">{t("dailyReport.enabled")}</span>
              <Switch
                checked={enabled}
                onCheckedChange={(v) => setDraft((d) => ({ ...(d ?? { cron }), enabled: v }))}
              />
            </label>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => void handleSave()}
                size="sm"
                className="h-8 rounded-lg px-3 text-[12px]"
              >
                {upsertMutation.isPending ? <MotionSpinner size={14} /> : null}
                {t("dailyReport.save")}
              </Button>
              <Button
                onClick={() => void handleTrigger()}
                size="sm"
                className="h-8 rounded-lg px-3 text-[12px]"
                disabled={triggerMutation.isPending || !schedule}
              >
                {triggerMutation.isPending ? <MotionSpinner size={14} /> : <Play size={14} />}
                {triggerMutation.isPending ? t("dailyReport.generating") : t("dailyReport.trigger")}
              </Button>
              {!schedule && (
                <span className="text-[12px] text-editorial-ink-muted">
                  {t("dailyReport.needSaveFirst")}
                </span>
              )}
            </div>
            {schedule?.lastError && (
              <p className="text-[12px] text-destructive">{schedule.lastError}</p>
            )}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-[14px] font-semibold text-editorial-ink">
          {t("dailyReport.history")}
        </h2>
        {videosLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : videos.length === 0 ? (
          <div className="rounded-lg border border-dashed border-editorial-hairline-strong bg-editorial-surface-card px-4 py-10 text-center text-[13px] text-editorial-ink-muted">
            {t("dailyReport.noVideos")}
          </div>
        ) : (
          <ul className="space-y-2">
            {videos.map((video) => (
              <VideoRow key={video.id} video={video} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function VideoRow({ video }: { video: ReportVideo }) {
  const { t } = useTranslation();
  // 真渲染有实际时长；占位/失败无内嵌播放（占位文件是文本标记）
  const playable = video.status === "success" && (video.duration ?? 0) > 0;
  return (
    <li className="rounded-lg border border-editorial-hairline bg-editorial-surface-card px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="text-[13px] font-medium text-editorial-ink tabular-nums">
          {video.reportDate}
        </span>
        <Badge variant={STATUS_VARIANT[video.status] ?? "secondary"}>
          {t(`dailyReport.status.${video.status}`)}
        </Badge>
        {video.status === "running" && video.stage && (
          <Badge variant="outline">{t(`dailyReport.stage.${video.stage}`)}</Badge>
        )}
        <span className="text-[12px] text-editorial-ink-muted">
          {video.duration != null ? `${video.duration}s` : "—"}
        </span>
        {video.error && (
          <span className="truncate text-[12px] text-destructive" title={video.error}>
            {video.error}
          </span>
        )}
        {!playable && (
          <a
            href={videoFileUrl(video.id)}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "ml-auto inline-flex shrink-0 items-center gap-1 text-[12px] text-editorial-primary hover:underline",
              video.status !== "success" && "pointer-events-none opacity-40",
            )}
          >
            <ExternalLink size={12} />
            {t("dailyReport.view")}
          </a>
        )}
      </div>
      {playable && (
        <div className="mt-3 flex items-center gap-3">
          <video
            controls
            preload="metadata"
            src={videoFileUrl(video.id)}
            className="aspect-video h-32 rounded-lg border border-editorial-hairline-strong bg-black"
          />
          <a
            href={videoFileUrl(video.id)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[12px] text-editorial-primary hover:underline"
          >
            <ExternalLink size={12} />
            {t("dailyReport.openInNewTab")}
          </a>
        </div>
      )}
    </li>
  );
}
