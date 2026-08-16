"use client";

import { useMemo, useState } from "react";
import { AlertCircle, ChevronDown, History } from "lucide-react";
import { useTranslation } from "react-i18next";
import { type OpsAction, type OpsLogRow, type OpsResult } from "@/lib/api/ops-log";
import { useOpsLog } from "@/lib/hooks/use-ops-log";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL_ACTIONS: OpsAction[] = ["create", "update", "delete", "import", "run"];
const ALL_RESULTS: OpsResult[] = ["success", "failed"];

// 动作徽标配色：除删除外统一中性浅灰，红色只表删除/失败，保持低视觉音量
const ACTION_VARIANT: Record<OpsAction, "default" | "secondary" | "destructive" | "outline"> = {
  create: "secondary",
  update: "secondary",
  delete: "destructive",
  import: "secondary",
  run: "secondary",
};

/** 行内时间只显示 HH:mm（日期由分组头承担） */
function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 分组标签：今天 / 昨天 / 日期（跨年带年份） */
function groupLabel(ts: number, t: (k: string) => string): string {
  const d = new Date(ts);
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (dayDiff === 0) return t("opsLog.group.today");
  if (dayDiff === 1) return t("opsLog.group.yesterday");
  const sameYear = d.getFullYear() === now.getFullYear();
  return `${sameYear ? "" : `${d.getFullYear()}年`}${d.getMonth() + 1}月${d.getDate()}日`;
}

export function OperationLog() {
  const { t } = useTranslation();
  // 筛选条件：undefined = 全部
  const [action, setAction] = useState<OpsAction | undefined>(undefined);
  const [result, setResult] = useState<OpsResult | undefined>(undefined);

  const {
    data,
    isPending,
    isError,
    isPlaceholderData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useOpsLog({ ...(action ? { action } : {}), ...(result ? { result } : {}) });

  // 分组按 id 倒序连续，顺序遍历即可
  const items = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data]);
  const groups = useMemo(() => {
    const list: { label: string; rows: OpsLogRow[] }[] = [];
    for (const item of items) {
      const label = groupLabel(item.ts, t);
      const last = list[list.length - 1];
      if (last?.label === label) last.rows.push(item);
      else list.push({ label, rows: [item] });
    }
    return list;
  }, [items, t]);
  const total = data?.pages[0]?.total ?? 0;

  return (
    <section>
      <h2 className="mb-2 flex items-center gap-1.5 text-[14px] font-semibold text-editorial-ink">
        <History size={14} className="text-editorial-ink-muted" />
        {t("opsLog.title")}
        {total > 0 && (
          <span className="text-[12px] font-normal text-editorial-ink-muted">({total})</span>
        )}
      </h2>

      {/* 筛选栏：动作 + 结果，切换即重新查询 */}
      <div className="mb-4 flex items-center gap-2">
        <Select
          value={action ?? "all"}
          onValueChange={(v) => setAction(v === "all" ? undefined : (v as OpsAction))}
        >
          <SelectTrigger size="sm" className="min-w-[112px]">
            <SelectValue placeholder={t("opsLog.filter.action")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("opsLog.filter.actionAll")}</SelectItem>
            {ALL_ACTIONS.map((a) => (
              <SelectItem key={a} value={a}>
                {t(`opsLog.action.${a}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={result ?? "all"}
          onValueChange={(v) => setResult(v === "all" ? undefined : (v as OpsResult))}
        >
          <SelectTrigger size="sm" className="min-w-[104px]">
            <SelectValue placeholder={t("opsLog.filter.result")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("opsLog.filter.resultAll")}</SelectItem>
            {ALL_RESULTS.map((r) => (
              <SelectItem key={r} value={r}>
                {t(`opsLog.result.${r}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-editorial-hairline-strong bg-editorial-surface-card px-4 py-10 text-center">
          <p className="text-[13px] font-medium text-editorial-ink">{t("opsLog.loadFailed")}</p>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-editorial-hairline-strong bg-editorial-surface-card px-4 py-10 text-center">
          <History size={22} className="text-editorial-ink-muted" />
          <p className="text-[13px] font-medium text-editorial-ink">
            {(action ?? result) ? t("opsLog.emptyFiltered") : t("opsLog.empty")}
          </p>
          <p className="text-[12px] text-editorial-ink-muted">
            {(action ?? result) ? t("opsLog.emptyFilteredHint") : t("opsLog.emptyHint")}
          </p>
        </div>
      ) : (
        <>
          {groups.map((group) => (
            <div key={group.label} className="mb-4 last:mb-0">
              <div className="mb-1.5 flex items-baseline gap-1.5 px-1 text-[12px] font-medium text-editorial-ink-muted">
                {group.label}
                <span className="tabular-nums opacity-70">· {group.rows.length}</span>
              </div>
              <ul className="divide-y divide-editorial-surface-soft overflow-hidden rounded-lg border border-editorial-hairline bg-editorial-surface-card">
                {group.rows.map((item) => (
                  <li
                    key={item.id}
                    title={new Date(item.ts).toLocaleString()}
                    className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 ${
                      item.result === "failed"
                        ? "bg-destructive/5 hover:bg-destructive/10"
                        : "hover:bg-editorial-canvas-soft"
                    }`}
                  >
                    <span className="w-[40px] shrink-0 text-[12px] text-editorial-ink-muted tabular-nums max-sm:hidden">
                      {formatTime(item.ts)}
                    </span>
                    <Badge
                      variant={ACTION_VARIANT[item.action]}
                      className="min-w-[44px] shrink-0 justify-center text-[12px]"
                    >
                      {t(`opsLog.action.${item.action}`)}
                    </Badge>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-editorial-ink">
                      <span className="text-editorial-ink-muted">
                        {t(`opsLog.target.${item.target}`)}
                      </span>
                      <span className="mx-1.5 text-editorial-hairline-strong">·</span>
                      {item.targetName}
                    </span>
                    {item.detail && (
                      <span
                        className="max-w-[45%] shrink-0 truncate text-right text-[12px] text-editorial-ink-muted max-sm:w-full max-sm:max-w-none max-sm:shrink max-sm:pl-[56px] max-sm:text-left"
                        title={item.detail}
                      >
                        {item.detail}
                      </span>
                    )}
                    {item.result === "failed" && (
                      <span className="flex shrink-0 items-center gap-1 text-[12px] font-medium text-destructive">
                        <AlertCircle size={13} />
                        {t("opsLog.failed")}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {hasNextPage && (
            <div className="mt-3 flex justify-center">
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1 rounded-lg px-3 text-[12px]"
                // 占位数据期间（筛选切换中）禁用，防止基于旧分页参数追加请求
                disabled={isFetchingNextPage || isPlaceholderData}
                onClick={() => void fetchNextPage()}
              >
                {isFetchingNextPage ? (
                  <span className="size-3 animate-spin rounded-full border-2 border-editorial-hairline-strong border-t-editorial-ink" />
                ) : (
                  <ChevronDown size={13} />
                )}
                {t("opsLog.loadMore")}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
