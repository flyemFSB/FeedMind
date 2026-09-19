import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  CalendarDays,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Film,
  Play,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { copyText } from "@/lib/clipboard";
import { formatDuration } from "@/lib/format";
import { videoFileUrl, type ReportVideo } from "@/lib/api/daily-report";

interface VideoCardProps {
  video: ReportVideo;
  onPlay: (video: ReportVideo) => void;
  onRegenerate?: (() => void) | undefined;
  isTriggering?: boolean | undefined;
}

export function VideoCard({ video, onPlay, onRegenerate, isTriggering }: VideoCardProps) {
  const { t } = useTranslation();
  const playable = video.status === "success" && (video.duration ?? 0) > 0;
  const url = videoFileUrl(video.id);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    void copyText(window.location.origin + url, t("dailyReport.copied"));
  };

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-xl border border-editorial-hairline bg-editorial-surface-card shadow-xs hover:border-editorial-hairline-strong hover:shadow-md hover:-translate-y-0.5 transition-[border-color,box-shadow,transform]">
      {/* 媒体封面/预览区：真实 button 语义，键盘可达（原 div+onClick 无键盘路径） */}
      <button
        type="button"
        onClick={() => playable && onPlay(video)}
        aria-label={`${video.reportDate} ${t("dailyReport.title")}`}
        className={`relative aspect-video w-full overflow-hidden bg-editorial-canvas-soft flex items-center justify-center ${
          playable ? "cursor-pointer" : ""
        }`}
      >
        {playable ? (
          <>
            <video
              preload="metadata"
              src={`${url}#t=0.5`}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
            {/* 播放遮罩与居中按钮 */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="flex size-11 items-center justify-center rounded-full bg-white/95 text-neutral-900 shadow-lg transform transition-transform group-hover:scale-110">
                <Play size={20} className="ml-0.5 fill-neutral-900" />
              </div>
            </div>
            {/* 右下角时长角标 */}
            {video.duration != null && video.duration > 0 && (
              <span className="absolute bottom-2 right-2 rounded-md bg-black/75 px-1.5 py-0.5 text-tiny font-medium text-white tabular-nums backdrop-blur-xs">
                {formatDuration(video.duration)}
              </span>
            )}
          </>
        ) : video.status === "running" ? (
          <div className="flex flex-col items-center gap-2 p-4 text-center">
            <span className="size-6 animate-spin rounded-full border-2 border-editorial-primary border-t-transparent" />
            <span className="text-xs font-medium text-editorial-primary animate-pulse">
              {t("dailyReport.generating")}
            </span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5 p-4 text-center text-destructive">
            <AlertCircle size={24} className="opacity-80" />
            <span className="text-xs font-medium">{t("dailyReport.triggerFailed")}</span>
          </div>
        )}

        {/* 左上角日期徽章 */}
        <div className="absolute top-2.5 left-2.5">
          <Badge
            variant="secondary"
            className="gap-1 bg-editorial-surface-card/90 font-medium text-editorial-ink backdrop-blur-xs shadow-xs"
          >
            <CalendarDays size={11} className="text-editorial-ink-muted" />
            <span>{video.reportDate}</span>
          </Badge>
        </div>
      </button>

      {/* 卡片下半部分内容 */}
      <div className="flex flex-1 flex-col justify-between p-4 space-y-3">
        <div>
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <h4 className="text-sm font-semibold text-editorial-ink">
              {video.reportDate} {t("dailyReport.title")}
            </h4>

            {/* 状态徽章 */}
            <Badge
              variant={
                video.status === "success"
                  ? "outline"
                  : video.status === "failed"
                    ? "destructive"
                    : "secondary"
              }
              className={
                video.status === "success"
                  ? "border-editorial-semantic-success/30 bg-editorial-semantic-success/10 text-editorial-semantic-success"
                  : ""
              }
            >
              {video.status === "running" && video.stage
                ? t(`dailyReport.stage.${video.stage}`)
                : t(`dailyReport.status.${video.status}`)}
            </Badge>
          </div>

          {/* 错误提示 */}
          {video.error && (
            <p
              className="line-clamp-2 text-tiny text-destructive bg-destructive/5 p-2 rounded border border-destructive/15 mt-2"
              title={video.error}
            >
              {video.error}
            </p>
          )}
        </div>

        {/* 底部操作工具栏 */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-editorial-hairline/60">
          <span className="text-tiny text-editorial-ink-muted">
            {video.duration ? (
              <span className="inline-flex items-center gap-1">
                <Clock size={11} />
                {video.duration}s
              </span>
            ) : (
              new Date(video.createdAt).toLocaleDateString()
            )}
          </span>

          <div className="flex items-center gap-1">
            {playable && (
              <>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={(e) => void handleCopy(e)}
                  className="h-7 w-7 text-editorial-ink-muted hover:text-editorial-ink"
                  title={t("dailyReport.copyLink")}
                  aria-label={t("dailyReport.copyLink")}
                >
                  <Copy size={13} />
                </Button>
                <a
                  href={url}
                  download={`${video.reportDate}-daily-report.mp4`}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex"
                >
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="h-7 w-7 text-editorial-ink-muted hover:text-editorial-ink"
                    title={t("dailyReport.download")}
                    aria-label={t("dailyReport.download")}
                  >
                    <Download size={13} />
                  </Button>
                </a>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex"
                >
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="h-7 w-7 text-editorial-ink-muted hover:text-editorial-ink"
                    title={t("dailyReport.openInNewTab")}
                    aria-label={t("dailyReport.openInNewTab")}
                  >
                    <ExternalLink size={13} />
                  </Button>
                </a>
                <Button
                  size="xs"
                  onClick={() => onPlay(video)}
                  className="h-7 gap-1 px-2 text-tiny"
                >
                  <Play size={11} className="fill-current" />
                  <span>{t("dailyReport.play")}</span>
                </Button>
              </>
            )}

            {video.status === "failed" && onRegenerate && (
              <Button
                variant="outline"
                size="xs"
                onClick={onRegenerate}
                disabled={isTriggering}
                className="h-7 gap-1 text-tiny"
              >
                <RotateCcw size={11} />
                <span>{t("dailyReport.regenerate")}</span>
              </Button>
            )}

            {!playable && video.status !== "failed" && video.status !== "running" && (
              <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex">
                <Button variant="outline" size="xs" className="h-7 gap-1 text-tiny">
                  <Film size={11} />
                  <span>{t("dailyReport.view")}</span>
                </Button>
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
