"use client";

import { useTranslation } from "react-i18next";
import { CalendarDays, Clock, Copy, Download, ExternalLink, Film } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { copyText } from "@/lib/clipboard";
import { formatDuration } from "@/lib/format";
import { videoFileUrl, type ReportVideo } from "@/lib/api/daily-report";

interface VideoPlayerDialogProps {
  video: ReportVideo | null;
  onClose: () => void;
}

export function VideoPlayerDialog({ video, onClose }: VideoPlayerDialogProps) {
  const { t } = useTranslation();

  if (!video) return null;

  const url = videoFileUrl(video.id);

  const handleCopyLink = () => {
    void copyText(window.location.origin + url, t("dailyReport.copied"));
  };

  return (
    <Dialog open={video !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl rounded-xl border border-editorial-hairline bg-editorial-surface-card p-5 shadow-xl">
        <DialogHeader className="gap-1 pb-3 border-b border-editorial-hairline">
          <div className="flex flex-wrap items-center justify-between gap-3 pr-6">
            <div className="flex items-center gap-2">
              <Film size={18} className="text-editorial-primary" />
              <DialogTitle className="text-base font-semibold text-editorial-ink">
                {video.reportDate} {t("dailyReport.title")}
              </DialogTitle>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              >
                <span className="size-1.5 rounded-full bg-emerald-500" />
                <span>{t(`dailyReport.status.${video.status}`)}</span>
              </Badge>
              {video.duration != null && video.duration > 0 && (
                <Badge variant="secondary" className="gap-1 text-tiny tabular-nums">
                  <Clock size={11} />
                  <span>{formatDuration(video.duration)}</span>
                </Badge>
              )}
            </div>
          </div>
          <DialogDescription className="text-xs text-editorial-ink-muted">
            ID #{video.id} ·{" "}
            {t("dailyReport.video.generatedAt", {
              time: new Date(video.createdAt).toLocaleString(),
            })}
          </DialogDescription>
        </DialogHeader>

        {/* 视频播放器 */}
        <div className="relative overflow-hidden rounded-xl border border-editorial-hairline-strong bg-black aspect-video flex items-center justify-center my-2 shadow-inner">
          <video
            controls
            autoPlay
            preload="auto"
            src={url}
            className="h-full w-full object-contain"
          />
        </div>

        {/* 底部工具操作栏 */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-editorial-hairline">
          <div className="flex items-center gap-2 text-xs text-editorial-ink-muted">
            <CalendarDays size={13} />
            <span>{video.reportDate}</span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleCopyLink()}
              className="h-8 gap-1.5 text-xs"
            >
              <Copy size={12} />
              <span>{t("dailyReport.copyLink")}</span>
            </Button>

            <a
              href={url}
              download={`${video.reportDate}-daily-report.mp4`}
              className="inline-flex items-center"
            >
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                <Download size={12} />
                <span>{t("dailyReport.download")}</span>
              </Button>
            </a>

            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center"
            >
              <Button size="sm" className="h-8 gap-1.5 text-xs">
                <ExternalLink size={12} />
                <span>{t("dailyReport.openInNewTab")}</span>
              </Button>
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
