"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, History } from "lucide-react";
import { useTranslation } from "react-i18next";
import { listOperations, type OpsAction, type OpsLogRow } from "@/lib/api/ops-log";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const PAGE_SIZE = 50;

// 动作徽标配色：增/改/删/导入/运行 语义色区分
const ACTION_VARIANT: Record<OpsAction, "default" | "secondary" | "destructive" | "outline"> = {
  create: "default",
  update: "outline",
  delete: "destructive",
  import: "secondary",
  run: "secondary",
};

/** 时间显示为 MM-DD HH:mm，完整时间放 title 悬浮 */
function formatTs(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function OperationLog() {
  const { t } = useTranslation();
  const [items, setItems] = useState<OpsLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async (offset: number, append: boolean) => {
    try {
      const result = await listOperations(PAGE_SIZE, offset);
      setItems((prev) => (append ? [...prev, ...result.items] : result.items));
      setTotal(result.total);
    } catch {
      // 错误由 apiFetch toast 统一提示
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void load(0, false);
  }, [load]);

  return (
    <section>
      <h2 className="mb-2 flex items-center gap-1.5 text-[14px] font-semibold text-editorial-ink">
        <History size={14} className="text-editorial-ink-muted" />
        {t("opsLog.title")}
        {total > 0 && (
          <span className="text-[12px] font-normal text-editorial-ink-muted">({total})</span>
        )}
      </h2>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-editorial-hairline-strong bg-editorial-surface-card px-4 py-8 text-center text-[13px] text-editorial-ink-muted">
          {t("opsLog.empty")}
        </div>
      ) : (
        <>
          <ul className="divide-y divide-editorial-surface-soft overflow-hidden rounded-lg border border-editorial-hairline bg-editorial-surface-card">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-editorial-canvas-soft"
              >
                <span
                  className="w-[92px] shrink-0 text-[12px] text-editorial-ink-muted tabular-nums"
                  title={new Date(item.ts).toLocaleString()}
                >
                  {formatTs(item.ts)}
                </span>
                <Badge
                  variant={ACTION_VARIANT[item.action]}
                  className="w-[44px] shrink-0 justify-center text-[12px]"
                >
                  {t(`opsLog.action.${item.action}`)}
                </Badge>
                <span className="min-w-0 flex-1 truncate text-[13px] text-editorial-ink">
                  <span className="text-editorial-ink-muted">
                    {t(`opsLog.target.${item.target}`)}
                  </span>
                  <span className="mx-1.5 text-editorial-hairline-strong">·</span>
                  {item.targetName}
                  {item.result === "failed" && (
                    <span className="ml-2 text-[12px] text-destructive">{t("opsLog.failed")}</span>
                  )}
                </span>
                {item.detail && (
                  <span className="shrink-0 text-[12px] text-editorial-ink-muted">
                    {item.detail}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {items.length < total && (
            <div className="mt-3 flex justify-center">
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1 rounded-lg px-3 text-[12px]"
                disabled={loadingMore}
                onClick={() => {
                  setLoadingMore(true);
                  void load(items.length, true);
                }}
              >
                {loadingMore ? (
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
