import { useMemo, useState, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Activity,
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Cookie,
  Copy,
  Cpu,
  Database,
  Download,
  FileText,
  Globe,
  History,
  Layers,
  List,
  MessageSquare,
  Network,
  Package,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Rss,
  Settings,
  Smartphone,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { type OpsAction, type OpsLogRow, type OpsResult } from "@/lib/api/ops-log";
import { useOpsLog } from "@/lib/hooks/use-ops-log";
import { copyText } from "@/lib/clipboard";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL_ACTIONS: OpsAction[] = ["create", "update", "delete", "import", "run"];
const ALL_RESULTS: OpsResult[] = ["success", "failed"];

// 所有系统对象/模块分类定义（严格对齐侧边栏与设置页图标规范）
export const ALL_TARGETS = [
  "wiki_space",
  "wiki_page",
  "wiki_source",
  "rss_source",
  "feeds",
  "daily_report",
  "model",
  "skill",
  "crawler_task",
  "runtime_config",
  "chat_session",
  "cookie_store",
  "remote_connection",
] as const;

export type OpsTarget = (typeof ALL_TARGETS)[number];

type VirtualOpsRow =
  { kind: "header"; label: string; count: number } | { kind: "row"; item: OpsLogRow };

const TARGET_ICONS: Record<string, LucideIcon> = {
  wiki_space: Network,
  wiki_page: FileText,
  wiki_source: Database,
  rss_source: List,
  feeds: Rss,
  daily_report: CalendarDays,
  model: Cpu,
  skill: Package,
  crawler_task: Globe,
  runtime_config: Settings,
  chat_session: MessageSquare,
  cookie_store: Cookie,
  remote_connection: Smartphone,
};

function TargetIcon({ target, className = "size-3.5" }: { target: string; className?: string }) {
  const Icon = TARGET_ICONS[target] ?? FileText;
  return <Icon className={className} />;
}

const ACTION_STYLE: Record<
  OpsAction,
  {
    variant: "default" | "secondary" | "outline" | "destructive";
    className: string;
    Icon: LucideIcon;
  }
> = {
  create: {
    variant: "outline",
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    Icon: Plus,
  },
  update: {
    variant: "outline",
    className: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
    Icon: Pencil,
  },
  delete: { variant: "destructive", className: "border border-destructive/20", Icon: Trash2 },
  import: {
    variant: "outline",
    className: "border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300",
    Icon: Download,
  },
  run: {
    variant: "outline",
    className: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    Icon: Play,
  },
};

function ActionBadge({ action, label }: { action: OpsAction; label: string }) {
  const { variant, className, Icon } = ACTION_STYLE[action] ?? {
    variant: "secondary" as const,
    className: "",
    Icon: null,
  };
  return (
    <Badge variant={variant} className={`gap-1 ${className}`}>
      {Icon && <Icon className="size-3 shrink-0" />}
      <span>{label}</span>
    </Badge>
  );
}

function ResultBadge({ result, label }: { result: OpsResult; label: string }) {
  if (result === "success") {
    return (
      <Badge
        variant="outline"
        className="gap-1.5 border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400"
      >
        <span className="size-1.5 rounded-full bg-emerald-500" />
        <span>{label}</span>
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="gap-1 border border-destructive/20">
      <AlertCircle className="size-3 shrink-0" />
      <span>{label}</span>
    </Badge>
  );
}

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

function formatDetailContent(detail: string | null): { isJson: boolean; text: string } {
  if (!detail) return { isJson: false, text: "" };
  try {
    const obj = JSON.parse(detail);
    return { isJson: true, text: JSON.stringify(obj, null, 2) };
  } catch {
    return { isJson: false, text: detail };
  }
}

interface FilterSelectProps<T extends string> {
  value: T | undefined;
  onValueChange: (v: T | undefined) => void;
  allLabel: string;
  allIcon: ReactNode;
  items: readonly T[];
  render: (v: T) => ReactNode;
  triggerClassName?: string;
  contentClassName?: string;
}

function FilterSelect<T extends string>({
  value,
  onValueChange,
  allLabel,
  allIcon,
  items,
  render,
  triggerClassName,
  contentClassName,
}: FilterSelectProps<T>) {
  return (
    <Select
      value={value ?? "all"}
      onValueChange={(v) => onValueChange(!v || v === "all" ? undefined : (v as T))}
    >
      <SelectTrigger
        size="sm"
        className={`h-8 min-w-[112px] border-editorial-hairline bg-editorial-surface-card hover:border-editorial-hairline-strong transition-colors ${triggerClassName ?? ""}`}
      >
        <SelectValue>
          {(val: string | null) =>
            !val || val === "all" ? (
              <span className="flex items-center gap-1.5 text-xs text-editorial-ink">
                {allIcon}
                <span>{allLabel}</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs text-editorial-ink">
                {render(val as T)}
              </span>
            )
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent
        align="start"
        side="bottom"
        alignItemWithTrigger={false}
        className={contentClassName}
      >
        <SelectItem value="all">
          <span className="flex items-center gap-2">
            {allIcon}
            <span>{allLabel}</span>
          </span>
        </SelectItem>
        {items.map((v) => (
          <SelectItem key={v} value={v}>
            <span className="flex items-center gap-2">{render(v)}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function OperationLog() {
  const { t } = useTranslation();
  // 筛选状态：undefined = 全部
  const [target, setTarget] = useState<string | undefined>(undefined);
  const [action, setAction] = useState<OpsAction | undefined>(undefined);
  const [result, setResult] = useState<OpsResult | undefined>(undefined);

  const [selectedLog, setSelectedLog] = useState<OpsLogRow | null>(null);

  const {
    data,
    isPending,
    isError,
    isFetching,
    isPlaceholderData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useOpsLog({
    ...(target ? { target } : {}),
    ...(action ? { action } : {}),
    ...(result ? { result } : {}),
  });

  const activeFilterCount = (target ? 1 : 0) + (action ? 1 : 0) + (result ? 1 : 0);

  const resetFilters = () => {
    setTarget(undefined);
    setAction(undefined);
    setResult(undefined);
  };

  // 展平分组为虚拟行：组标题与行数据作为独立虚拟节点
  const items = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data]);
  const virtualRows = useMemo<VirtualOpsRow[]>(() => {
    const list: { label: string; rows: OpsLogRow[] }[] = [];
    for (const item of items) {
      const label = groupLabel(item.ts, t);
      const last = list[list.length - 1];
      if (last?.label === label) last.rows.push(item);
      else list.push({ label, rows: [item] });
    }
    const flat: VirtualOpsRow[] = [];
    for (const group of list) {
      flat.push({ kind: "header", label: group.label, count: group.rows.length });
      for (const row of group.rows) {
        flat.push({ kind: "row", item: row });
      }
    }
    return flat;
  }, [items, t]);

  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);

  const rowVirtualizer = useVirtualizer({
    count: virtualRows.length,
    getScrollElement: () => scrollEl,
    estimateSize: (index) => (virtualRows[index]?.kind === "header" ? 34 : 52),
    overscan: 8,
    getItemKey: (index) => {
      const r = virtualRows[index]!;
      return r.kind === "header" ? `header:${r.label}` : `row:${r.item.id}`;
    },
  });

  const total = data?.pages[0]?.total ?? 0;

  return (
    <section className="space-y-4">
      {/* 头部标题与统计 */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-editorial-ink">
          <History size={16} className="text-editorial-ink-muted" />
          <span>{t("opsLog.title")}</span>
          {total > 0 && (
            <Badge
              variant="secondary"
              className="font-normal text-editorial-ink-muted tabular-nums"
            >
              {total}
            </Badge>
          )}
        </h2>
      </div>

      {/* 筛选与操作工具栏 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect
            value={target}
            onValueChange={setTarget}
            allLabel={t("opsLog.filter.targetAll")}
            allIcon={<Layers size={13} className="text-editorial-ink-muted shrink-0" />}
            items={ALL_TARGETS}
            triggerClassName="min-w-[130px]"
            contentClassName="max-h-[320px] min-w-[170px]"
            render={(v) => (
              <>
                <TargetIcon target={v} className="size-3.5 text-editorial-ink-muted shrink-0" />
                <span>{t(`opsLog.target.${v}`, { defaultValue: v })}</span>
              </>
            )}
          />

          <FilterSelect
            value={action}
            onValueChange={setAction}
            allLabel={t("opsLog.filter.actionAll")}
            allIcon={<Activity size={13} className="text-editorial-ink-muted shrink-0" />}
            items={ALL_ACTIONS}
            triggerClassName="min-w-[116px]"
            contentClassName="min-w-[140px]"
            render={(v) => <ActionBadge action={v} label={t(`opsLog.action.${v}`)} />}
          />

          <FilterSelect
            value={result}
            onValueChange={setResult}
            allLabel={t("opsLog.filter.resultAll")}
            allIcon={<CheckCircle2 size={13} className="text-editorial-ink-muted shrink-0" />}
            items={ALL_RESULTS}
            triggerClassName="min-w-[112px]"
            contentClassName="min-w-[130px]"
            render={(v) => <ResultBadge result={v} label={t(`opsLog.result.${v}`)} />}
          />

          {/* 有筛选时显示重置按钮 */}
          {activeFilterCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              className="h-8 gap-1.5 px-2.5 text-xs text-editorial-ink-muted hover:text-editorial-ink"
              title={t("opsLog.filter.reset")}
            >
              <RotateCcw size={12} />
              <span>{t("opsLog.filter.reset")}</span>
              <Badge
                variant="secondary"
                className="h-4 px-1 text-tiny font-medium text-editorial-ink-soft"
              >
                {activeFilterCount}
              </Badge>
            </Button>
          )}
        </div>

        {/* 右侧：刷新按钮 */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="h-8 gap-1.5 rounded-lg border-editorial-hairline bg-editorial-surface-card px-2.5 text-xs text-editorial-ink hover:bg-editorial-surface-soft transition-colors"
            title={t("opsLog.refresh")}
          >
            <RefreshCw
              size={12}
              className={
                isFetching && !isFetchingNextPage ? "animate-spin text-editorial-primary" : ""
              }
            />
            <span>{t("opsLog.refresh")}</span>
          </Button>
        </div>
      </div>

      {/* 表格主体：加载中显示骨架行，有数据显示虚拟化分组行 */}
      {(isPending || (items.length > 0 && !isError)) && (
        <div
          ref={setScrollEl}
          className="max-h-[640px] overflow-y-auto overflow-x-hidden rounded-xl border border-editorial-hairline bg-editorial-surface-card shadow-xs"
        >
          {/* 表头固定在容器顶部 */}
          <div className="sticky top-0 z-10 grid grid-cols-[90px_96px_130px_minmax(200px,1fr)_96px] items-center border-b border-editorial-hairline bg-editorial-surface-soft px-4 py-2.5 text-tiny font-medium uppercase tracking-wider text-editorial-ink-muted select-none">
            <div>{t("opsLog.table.time")}</div>
            <div className="px-3">{t("opsLog.table.action")}</div>
            <div className="px-3">{t("opsLog.table.category")}</div>
            <div className="px-3">{t("opsLog.table.targetName")}</div>
            <div className="px-4 text-right">{t("opsLog.table.status")}</div>
          </div>

          {isPending ? (
            <div className="divide-y divide-editorial-hairline/40">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[90px_96px_130px_minmax(200px,1fr)_96px] items-center px-4 py-3"
                >
                  <Skeleton className="h-4 w-12" />
                  <div className="px-3">
                    <Skeleton className="h-5 w-14 rounded-md" />
                  </div>
                  <div className="px-3">
                    <Skeleton className="h-4 w-20" />
                  </div>
                  <div className="px-3">
                    <Skeleton className="h-4 w-48" />
                  </div>
                  <div className="flex justify-end px-4">
                    <Skeleton className="h-4 w-12" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="relative w-full" style={{ height: rowVirtualizer.getTotalSize() }}>
              {rowVirtualizer.getVirtualItems().map((vRow) => {
                const row = virtualRows[vRow.index]!;
                return (
                  <div
                    key={vRow.key}
                    ref={rowVirtualizer.measureElement}
                    data-index={vRow.index}
                    className="absolute left-0 top-0 w-full"
                    style={{ transform: `translateY(${vRow.start}px)` }}
                  >
                    {row.kind === "header" ? (
                      <div className="border-y border-editorial-hairline/60 bg-editorial-canvas-soft/70 px-4 py-1.5 text-xs font-medium text-editorial-ink-muted select-none">
                        <div className="flex items-center gap-2">
                          <span>{row.label}</span>
                          <Badge
                            variant="secondary"
                            className="font-normal text-editorial-ink-soft tabular-nums"
                          >
                            {t("opsLog.table.recordsCount", { count: row.count })}
                          </Badge>
                        </div>
                      </div>
                    ) : (
                      <div
                        onClick={() => setSelectedLog(row.item)}
                        className={`group/row grid grid-cols-[90px_96px_130px_minmax(200px,1fr)_96px] items-center cursor-pointer border-b border-editorial-hairline/40 px-4 py-2.5 transition-colors ${
                          row.item.result === "failed"
                            ? "bg-destructive/5 hover:bg-destructive/10"
                            : "hover:bg-editorial-surface-soft/80"
                        }`}
                      >
                        <div className="text-xs text-editorial-ink-muted tabular-nums whitespace-nowrap">
                          {formatDateTime(row.item.ts)}
                        </div>
                        <div className="px-3 whitespace-nowrap">
                          <ActionBadge
                            action={row.item.action}
                            label={t(`opsLog.action.${row.item.action}`)}
                          />
                        </div>
                        <div className="flex items-center gap-1.5 px-3 text-xs text-editorial-ink-soft whitespace-nowrap">
                          <TargetIcon
                            target={row.item.target}
                            className="size-3.5 text-editorial-ink-muted shrink-0"
                          />
                          <span className="truncate">
                            {t(`opsLog.target.${row.item.target}`, {
                              defaultValue: row.item.target,
                            })}
                          </span>
                        </div>
                        <div className="flex flex-col gap-0.5 min-w-0 px-3">
                          <span
                            className="truncate text-body font-medium text-editorial-ink group-hover/row:text-editorial-primary transition-colors"
                            title={row.item.targetName}
                          >
                            {row.item.targetName}
                          </span>
                          {row.item.detail && (
                            <span
                              className="truncate text-tiny text-editorial-ink-muted max-w-[500px]"
                              title={row.item.detail}
                            >
                              {row.item.detail}
                            </span>
                          )}
                        </div>
                        <div className="flex justify-end px-4 whitespace-nowrap">
                          <ResultBadge
                            result={row.item.result}
                            label={t(`opsLog.result.${row.item.result}`)}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 加载失败 */}
      {isError && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-editorial-hairline-strong bg-editorial-surface-card px-4 py-12 text-center">
          <AlertCircle size={24} className="text-destructive" />
          <p className="text-body font-medium text-editorial-ink">{t("opsLog.loadFailed")}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            className="mt-2 text-xs"
          >
            {t("opsLog.refresh")}
          </Button>
        </div>
      )}

      {/* 空状态 */}
      {!isPending && !isError && items.length === 0 && (
        <div className="flex flex-col items-center gap-2.5 rounded-xl border border-dashed border-editorial-hairline-strong bg-editorial-surface-card px-4 py-14 text-center">
          <History size={26} className="text-editorial-ink-muted opacity-60" />
          <p className="text-sm font-medium text-editorial-ink">
            {activeFilterCount > 0 ? t("opsLog.emptyFiltered") : t("opsLog.empty")}
          </p>
          <p className="text-xs text-editorial-ink-muted max-w-sm">
            {activeFilterCount > 0 ? t("opsLog.emptyFilteredHint") : t("opsLog.emptyHint")}
          </p>
          {activeFilterCount > 0 && (
            <Button variant="outline" size="sm" onClick={resetFilters} className="mt-1 h-8 text-xs">
              {t("opsLog.filter.reset")}
            </Button>
          )}
        </div>
      )}

      {/* 加载更多按钮 */}
      {!isPending && !isError && hasNextPage && items.length > 0 && (
        <div className="mt-1 flex justify-center">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 rounded-lg border-editorial-hairline px-3 text-xs text-editorial-ink hover:bg-editorial-surface-soft transition-colors"
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

      {/* 日志详情弹窗 */}
      <Dialog open={selectedLog !== null} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-w-lg rounded-xl border border-editorial-hairline bg-editorial-surface-card p-5 shadow-lg">
          <DialogHeader className="gap-1 pb-3 border-b border-editorial-hairline">
            <div className="flex items-center gap-2">
              <History size={16} className="text-editorial-ink-muted" />
              <DialogTitle className="text-base font-semibold text-editorial-ink">
                {t("opsLog.detailDialog.title")}
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-editorial-ink-muted tabular-nums">
              ID #{selectedLog?.id} ·{" "}
              {selectedLog ? formatDateTime(selectedLog.ts, { withDate: true }) : ""}
            </DialogDescription>
          </DialogHeader>

          {selectedLog && (
            <div className="space-y-3.5 py-1 text-body">
              {/* 动作与状态网格 */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-lg border border-editorial-hairline/80 bg-editorial-canvas-soft/60 p-2.5">
                  <span className="mb-1 block text-tiny font-medium uppercase tracking-wider text-editorial-ink-muted">
                    {t("opsLog.detailDialog.action")}
                  </span>
                  <ActionBadge
                    action={selectedLog.action}
                    label={t(`opsLog.action.${selectedLog.action}`)}
                  />
                </div>
                <div className="rounded-lg border border-editorial-hairline/80 bg-editorial-canvas-soft/60 p-2.5">
                  <span className="mb-1 block text-tiny font-medium uppercase tracking-wider text-editorial-ink-muted">
                    {t("opsLog.detailDialog.status")}
                  </span>
                  <ResultBadge
                    result={selectedLog.result}
                    label={t(`opsLog.result.${selectedLog.result}`)}
                  />
                </div>
              </div>

              {/* 所属分类与目标对象 */}
              <div className="rounded-lg border border-editorial-hairline/80 bg-editorial-canvas-soft/60 p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-tiny font-medium uppercase tracking-wider text-editorial-ink-muted">
                    {t("opsLog.detailDialog.category")} / {t("opsLog.detailDialog.targetName")}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() =>
                      void copyText(selectedLog.targetName, t("opsLog.detailDialog.copied"))
                    }
                    className="h-6 w-6 text-editorial-ink-muted hover:text-editorial-ink"
                    title={t("opsLog.detailDialog.copyDetail")}
                  >
                    <Copy size={12} />
                  </Button>
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant="outline" className="gap-1.5 text-editorial-ink-soft">
                    <TargetIcon
                      target={selectedLog.target}
                      className="size-3.5 text-editorial-ink-muted"
                    />
                    <span>
                      {t(`opsLog.target.${selectedLog.target}`, {
                        defaultValue: selectedLog.target,
                      })}
                    </span>
                  </Badge>
                  <span className="truncate font-mono text-body font-medium text-editorial-ink">
                    {selectedLog.targetName}
                  </span>
                </div>
              </div>

              {/* 详情或附加数据 */}
              {selectedLog.detail && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-tiny font-medium uppercase tracking-wider text-editorial-ink-muted">
                      {t("opsLog.detailDialog.detail")}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        void copyText(selectedLog.detail!, t("opsLog.detailDialog.copied"))
                      }
                      className="h-6 gap-1 px-2 text-tiny text-editorial-ink-muted hover:text-editorial-ink"
                    >
                      <Copy size={11} />
                      <span>{t("opsLog.detailDialog.copyDetail")}</span>
                    </Button>
                  </div>
                  <pre className="max-h-[220px] overflow-auto rounded-lg border border-editorial-hairline bg-editorial-canvas-soft/90 p-3 font-mono text-xs text-editorial-ink whitespace-pre-wrap break-all leading-relaxed">
                    {formatDetailContent(selectedLog.detail).text}
                  </pre>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="pt-2 border-t border-editorial-hairline">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedLog(null)}
              className="text-xs"
            >
              {t("opsLog.detailDialog.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
