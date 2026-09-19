import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { CalendarClock, Clock, Save, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MotionSpinner } from "@/components/ui/motion-spinner";
import type { ScheduleTask } from "@/lib/api/daily-report";

const CRON_PRESETS = [
  { value: "0 7 * * *", labelKey: "dailyReport.preset.daily0700" },
  { value: "0 8 * * *", labelKey: "dailyReport.preset.daily0800" },
  { value: "0 9 * * *", labelKey: "dailyReport.preset.daily0900" },
  { value: "0 12 * * *", labelKey: "dailyReport.preset.daily1200" },
  { value: "0 20 * * *", labelKey: "dailyReport.preset.daily2000" },
  { value: "0 22 * * *", labelKey: "dailyReport.preset.daily2200" },
  { value: "30 8 * * 1-5", labelKey: "dailyReport.preset.weekdays0830" },
] as const;

interface ScheduleCardProps {
  schedule?: ScheduleTask | undefined;
  isLoading: boolean;
  isSaving: boolean;
  isTriggering: boolean;
  onSave: (cron: string, enabled: boolean) => Promise<void>;
  onTrigger: () => Promise<void>;
}

export function ScheduleCard({
  schedule,
  isLoading,
  isSaving,
  isTriggering,
  onSave,
  onTrigger,
}: ScheduleCardProps) {
  const { t } = useTranslation();

  // 本地草稿与编辑态
  const [enabled, setEnabled] = useState(true);
  const [cronValue, setCronValue] = useState("0 8 * * *");

  useEffect(() => {
    if (schedule) {
      setEnabled(schedule.enabled);
      setCronValue(schedule.cron);
    }
  }, [schedule]);

  // 判断是否有未保存的修改（schedule 为空时视为脏：需要先保存）
  const isDirty = schedule?.enabled !== enabled || schedule?.cron !== cronValue;

  const handlePresetChange = (val: string | null) => {
    if (!val) return;
    setCronValue(val);
  };

  const handleSaveClick = async () => {
    await onSave(cronValue || "0 8 * * *", enabled);
  };

  if (isLoading) {
    return (
      <div className="rounded-xl border border-editorial-hairline bg-editorial-surface-card p-5 shadow-xs space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-editorial-hairline bg-editorial-surface-card shadow-xs">
      {/* 卡片头部 */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-editorial-hairline bg-editorial-surface-soft/60 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-lg bg-editorial-primary/10 text-editorial-primary">
            <CalendarClock size={16} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-editorial-ink">
              {t("dailyReport.schedule")}
            </h2>
          </div>
        </div>

        {/* 右侧状态徽章 */}
        <div className="flex items-center gap-2">
          {schedule?.lastRunStatus && (
            <Badge
              variant={
                schedule.lastRunStatus === "success"
                  ? "outline"
                  : schedule.lastRunStatus === "failed"
                    ? "destructive"
                    : "secondary"
              }
              className={
                schedule.lastRunStatus === "success"
                  ? "border-editorial-semantic-success/30 bg-editorial-semantic-success/10 text-editorial-semantic-success"
                  : ""
              }
            >
              {t(`dailyReport.status.${schedule.lastRunStatus}`)}
            </Badge>
          )}
          <Badge
            variant={enabled ? "outline" : "secondary"}
            className={
              enabled
                ? "border-editorial-semantic-success/20 text-editorial-semantic-success"
                : "text-editorial-ink-muted"
            }
          >
            {enabled ? t("dailyReport.stats.active") : t("dailyReport.stats.inactive")}
          </Badge>
        </div>
      </div>

      {/* 表单区域 */}
      <div className="p-5 space-y-4">
        {/* 自动定时生成开关与预设时刻在同一行 */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-editorial-hairline/80 bg-editorial-canvas-soft/40 p-3.5">
          {/* 左侧：开关与说明 */}
          <div className="flex items-center gap-3">
            <Switch
              id="daily-report-enabled-switch"
              checked={enabled}
              onCheckedChange={setEnabled}
            />
            <div className="space-y-0.5">
              <label
                htmlFor="daily-report-enabled-switch"
                className="text-body font-medium text-editorial-ink cursor-pointer"
              >
                {t("dailyReport.enabled")}
              </label>
              <p className="text-xs text-editorial-ink-muted">{t("dailyReport.enabledDesc")}</p>
            </div>
          </div>

          {/* 右侧：预设时刻下拉选择器 */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-editorial-ink-muted whitespace-nowrap">
              {t("dailyReport.cronLabel")}:
            </span>
            <Select value={cronValue} onValueChange={handlePresetChange}>
              <SelectTrigger className="h-8.5 min-w-[200px] border-editorial-hairline bg-editorial-surface-card text-xs">
                <SelectValue>
                  {(val) => {
                    const preset = CRON_PRESETS.find((p) => p.value === val);
                    return (
                      <span className="flex items-center gap-1.5 truncate">
                        <Clock size={13} className="text-editorial-ink-muted shrink-0" />
                        <span>{preset ? t(preset.labelKey) : (val ?? "0 8 * * *")}</span>
                      </span>
                    );
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent
                align="end"
                side="bottom"
                alignItemWithTrigger={false}
                className="min-w-[210px]"
              >
                {CRON_PRESETS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    <span className="flex items-center gap-2">
                      <Clock size={13} className="text-editorial-ink-muted shrink-0" />
                      <span>{t(p.labelKey)}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* 错误提示 */}
        {schedule?.lastError && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">
            {schedule.lastError}
          </div>
        )}

        {/* 底部操作按钮栏 */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-editorial-hairline/60">
          <div className="flex items-center gap-2">
            <Button
              onClick={() => void handleSaveClick()}
              disabled={isSaving || !isDirty}
              size="sm"
              className="h-8 gap-1.5 rounded-lg px-3.5 text-xs"
            >
              {isSaving ? <MotionSpinner size={13} /> : <Save size={13} />}
              <span>{t("dailyReport.save")}</span>
            </Button>

            {isDirty && (
              <span className="text-tiny text-editorial-accent">
                {t("dailyReport.needSaveFirst")}
              </span>
            )}
          </div>

          <Button
            onClick={() => void onTrigger()}
            disabled={isTriggering || !schedule}
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 rounded-lg border-editorial-primary/30 text-editorial-primary hover:bg-editorial-primary/10 transition-colors px-3.5 text-xs"
          >
            {isTriggering ? <MotionSpinner size={13} /> : <Sparkles size={13} />}
            <span>{isTriggering ? t("dailyReport.generating") : t("dailyReport.trigger")}</span>
          </Button>
        </div>
      </div>
    </section>
  );
}
