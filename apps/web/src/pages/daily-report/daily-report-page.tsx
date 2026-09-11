import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarDays, Film, Sparkles, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import {
  useDailyReportSchedules,
  useDailyReportVideos,
  useUpsertSchedule,
  useTriggerReport,
} from "@/lib/hooks/use-daily-report";
import type { ReportVideo, ScheduleTask } from "@/lib/api/daily-report";
import { ScheduleCard } from "@/pages/daily-report/schedule-card";
import { VideoCard } from "@/pages/daily-report/video-card";
import { VideoPlayerDialog } from "@/pages/daily-report/video-player-dialog";

const SCHEDULE_ID = "daily-video";

export function DailyReportPage() {
  const { t } = useTranslation();
  const {
    data: schedules = [],
    isLoading: schedulesLoading,
    refetch: refetchSchedules,
  } = useDailyReportSchedules();
  const {
    data: videos = [],
    isLoading: videosLoading,
    isFetching: videosFetching,
    refetch: refetchVideos,
  } = useDailyReportVideos();
  const upsertMutation = useUpsertSchedule();
  const triggerMutation = useTriggerReport();

  const schedule: ScheduleTask | undefined = schedules[0];
  const [playingVideo, setPlayingVideo] = useState<ReportVideo | null>(null);

  const handleSave = async (cron: string, enabled: boolean) => {
    try {
      await upsertMutation.mutateAsync({
        id: SCHEDULE_ID,
        body: { name: t("dailyReport.taskName"), cron, enabled },
      });
      toast.add({ title: t("dailyReport.saved"), type: "success" });
    } catch {
      // 错误由 apiFetch 统一 toast 处理
    }
  };

  const handleTrigger = async () => {
    try {
      const video = await triggerMutation.mutateAsync(schedule?.id ?? SCHEDULE_ID);
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
      // 错误由 apiFetch 统一 toast 处理
    }
  };

  const handleRefreshAll = () => {
    void refetchSchedules();
    void refetchVideos();
  };

  return (
    <div className="mx-auto max-w-[1140px] space-y-6 px-6 py-6 max-sm:px-4">
      {/* 顶部标题与概览 */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2.5 text-xl font-bold text-editorial-ink tracking-tight">
            <Film size={22} className="text-editorial-primary" />
            <span>{t("dailyReport.title")}</span>
          </h1>
          <p className="text-body text-editorial-ink-muted">{t("dailyReport.subtitle")}</p>
        </div>

        {/* 顶部统计小卡 */}
        <div className="flex items-center gap-2.5">
          <Badge
            variant="secondary"
            className="gap-1.5 px-3 py-1 text-xs font-normal text-editorial-ink"
          >
            <span className="text-editorial-ink-muted">{t("dailyReport.stats.total")}:</span>
            <span className="font-semibold tabular-nums">{videos.length}</span>
          </Badge>

          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshAll}
            disabled={videosFetching}
            className="h-8 gap-1.5 text-xs border-editorial-hairline bg-editorial-surface-card hover:bg-editorial-surface-soft transition-colors"
          >
            <RefreshCw
              size={12}
              className={videosFetching ? "animate-spin text-editorial-primary" : ""}
            />
            <span>{t("opsLog.refresh")}</span>
          </Button>
        </div>
      </div>

      {/* 定时生成任务配置卡片 */}
      <ScheduleCard
        schedule={schedule}
        isLoading={schedulesLoading}
        isSaving={upsertMutation.isPending}
        isTriggering={triggerMutation.isPending}
        onSave={handleSave}
        onTrigger={handleTrigger}
      />

      {/* 历史日报视频展示区 */}
      <section className="space-y-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CalendarDays size={16} className="text-editorial-ink-muted" />
            <h3 className="text-base font-semibold text-editorial-ink">
              {t("dailyReport.history")}
            </h3>
            {videos.length > 0 && (
              <Badge
                variant="secondary"
                className="font-normal text-editorial-ink-muted tabular-nums"
              >
                {videos.length}
              </Badge>
            )}
          </div>
        </div>

        {videosLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="overflow-hidden rounded-xl border border-editorial-hairline bg-editorial-surface-card p-3.5 space-y-3"
              >
                <Skeleton className="aspect-video w-full rounded-lg" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
            ))}
          </div>
        ) : videos.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2.5 rounded-xl border border-dashed border-editorial-hairline-strong bg-editorial-surface-card px-4 py-14 text-center">
            <div className="flex size-10 items-center justify-center rounded-full bg-editorial-surface-soft text-editorial-ink-muted">
              <Film size={20} />
            </div>
            <p className="text-sm font-medium text-editorial-ink">{t("dailyReport.noVideos")}</p>
            <p className="max-w-md text-xs text-editorial-ink-muted">
              {t("dailyReport.noVideosHint")}
            </p>
            <Button
              onClick={() => void handleTrigger()}
              disabled={triggerMutation.isPending || !schedule}
              size="sm"
              className="mt-2 h-8 gap-1.5 px-3.5 text-xs"
            >
              <Sparkles size={13} />
              <span>{t("dailyReport.trigger")}</span>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {videos.map((video) => (
              <VideoCard
                key={video.id}
                video={video}
                onPlay={setPlayingVideo}
                onRegenerate={() => void handleTrigger()}
                isTriggering={triggerMutation.isPending}
              />
            ))}
          </div>
        )}
      </section>

      {/* 视频弹窗全屏播放器 */}
      <VideoPlayerDialog video={playingVideo} onClose={() => setPlayingVideo(null)} />
    </div>
  );
}
