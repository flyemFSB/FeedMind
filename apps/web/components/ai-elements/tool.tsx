/**
 * ai-elements Tool — Agent 工具调用可视化
 *
 * 使用 Collapsible 基元构建，对齐官方 Tool 组件结构：
 *   Tool (Collapsible)
 *     ├─ ToolHeader (CollapsibleTrigger) — 工具名 + 状态图标 + 状态标签
 *     ├─ ToolContent (CollapsibleContent)
 *          ├─ ToolInput  — 参数
 *          └─ ToolOutput — 结果/错误
 *
 * 与官方差异：
 * - 保留 FeedMind editorial 设计令牌
 * - 保留中文 i18n
 * - 默认折叠已完成工具的详情，仅显示摘要
 * - 工具名映射为人类可读中文（如 web_search → 网络搜索）
 * - type 为 dynamic-tool 时从 state 推断状态，否则自动从 type 提取 toolName
 */
"use client";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { MotionSpinner } from "@/components/ui/motion-spinner";
import { useTranslation } from "react-i18next";
import {
  Check,
  AlertCircle,
  Loader2,
  Wrench,
  HelpCircle,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

/* ── 工具名 → 人类可读中文映射 ── */
const TOOL_NAME_LABELS: Record<string, string> = {
  web_search: "网络搜索",
  web_search_extract: "网页抓取",
  retrieve: "信息检索",
  read_wiki: "Wiki 读取",
  write_wiki: "Wiki 写入",
  search_sources: "来源搜索",
  crawl: "网页爬取",
  extract: "信息提取",
  search_db: "数据库查询",
  search: "搜索",
  planning: "任务规划",
};

function getToolLabel(toolName: string): string {
  return TOOL_NAME_LABELS[toolName] ?? toolName;
}

/* ── 工具状态映射 ── */
export type ToolPartState =
  | "input-streaming"
  | "input-available"
  | "approval-requested"
  | "approval-responded"
  | "output-available"
  | "output-error"
  | "output-denied";

const STATUS_ICON: Record<ToolPartState, LucideIcon> = {
  "input-streaming": Loader2,
  "input-available": Wrench,
  "approval-requested": HelpCircle,
  "approval-responded": Check,
  "output-available": Check,
  "output-error": AlertCircle,
  "output-denied": XCircle,
};

const STATUS_ICON_CLASS: Record<ToolPartState, string> = {
  "input-streaming": "text-editorial-ink-muted",
  "input-available": "text-editorial-ink-muted",
  "approval-requested": "text-editorial-semantic-warning",
  "approval-responded": "text-editorial-ink-muted",
  "output-available": "text-editorial-semantic-success",
  "output-error": "text-editorial-semantic-error",
  "output-denied": "text-editorial-semantic-error",
};

function getStatusLabel(state: ToolPartState): string {
  const labels: Record<ToolPartState, string> = {
    "input-streaming": "准备中",
    "input-available": "执行中",
    "approval-requested": "等待确认",
    "approval-responded": "已确认",
    "output-available": "已完成",
    "output-error": "出错",
    "output-denied": "已拒绝",
  };
  return labels[state];
}

/* ── Props ── */
export type ToolProps = ComponentProps<typeof Collapsible>;

export type ToolHeaderProps = Omit<ComponentProps<typeof CollapsibleTrigger>, "type"> & {
  type: `tool-${string}` | "dynamic-tool";
  state: ToolPartState;
  toolName?: string;
  title?: string;
};

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export type ToolInputProps = ComponentProps<"div"> & {
  input?: unknown;
};

export type ToolOutputProps = ComponentProps<"div"> & {
  output?: ReactNode;
  errorText?: string;
};

/* ── Tool ── */
export function Tool({ className, defaultOpen, ...props }: ToolProps) {
  return (
    <Collapsible
      className={cn("w-full min-w-0", className)}
      defaultOpen={defaultOpen ?? false}
      {...props}
    />
  );
}

/* ── ToolHeader ── */
export function ToolHeader({
  className,
  type,
  state,
  toolName,
  title,
  children,
  ...props
}: ToolHeaderProps) {
  const derivedName = type === "dynamic-tool" ? (toolName ?? "") : type.slice("tool-".length);
  const displayName = title ?? getToolLabel(derivedName);
  const Icon = STATUS_ICON[state];
  const iconClass = STATUS_ICON_CLASS[state];

  return (
    <CollapsibleTrigger
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px]",
        "hover:bg-editorial-surface-soft",
        state === "output-error" && "bg-editorial-semantic-error/5",
        className,
      )}
      {...props}
    >
      {children ?? (
        <>
          {state === "input-streaming" ? (
            <MotionSpinner size={14} className={iconClass} />
          ) : (
            <Icon size={14} className={cn("shrink-0", iconClass)} />
          )}
          <span className="flex-1 truncate font-medium text-editorial-ink">{displayName}</span>
          <span className="shrink-0 text-[12px] text-editorial-ink-muted font-normal">
            {getStatusLabel(state)}
          </span>
        </>
      )}
    </CollapsibleTrigger>
  );
}

/* ── ToolContent ── */
export function ToolContent({ className, ...props }: ToolContentProps) {
  return (
    <CollapsibleContent className={cn("min-w-0 px-3 pb-2 pt-1 space-y-2", className)} {...props} />
  );
}

/* ── ToolInput — 格式化参数展示 ── */
export function ToolInput({ className, input, ...props }: ToolInputProps) {
  const { t } = useTranslation();
  if (input === undefined || input === null) return null;

  const formatted = formatPayload(input);
  if (!formatted || formatted === "{}" || formatted === '""') return null;

  return (
    <div className={cn("min-w-0", className)} {...props}>
      <div className="mb-0.5 text-[12px] font-medium text-editorial-ink-muted tracking-wide uppercase">
        {t("chat.toolArgs")}
      </div>
      <pre className="w-full max-w-full max-h-40 overflow-auto whitespace-pre-wrap break-words rounded border border-editorial-hairline bg-editorial-surface-soft/50 px-2.5 py-2 text-[12px] leading-[1.5] text-editorial-ink-soft font-mono [scrollbar-gutter:stable]">
        {formatted}
      </pre>
    </div>
  );
}

/* ── ToolOutput — 结果/错误展示 ── */
export function ToolOutput({ className, output, errorText, ...props }: ToolOutputProps) {
  const { t } = useTranslation();
  if (!output && !errorText) return null;

  return (
    <div className={cn("min-w-0", className)} {...props}>
      <div
        className={cn(
          "mb-0.5 text-[12px] font-medium tracking-wide uppercase",
          errorText ? "text-editorial-semantic-error" : "text-editorial-ink-muted",
        )}
      >
        {errorText ? t("common.error") : t("chat.toolResult")}
      </div>

      {errorText && (
        <pre className="w-full max-w-full max-h-48 overflow-auto whitespace-pre-wrap break-words rounded border border-editorial-semantic-error/20 bg-editorial-semantic-error/5 px-2.5 py-2 text-[12px] leading-[1.5] text-editorial-semantic-error font-mono [scrollbar-gutter:stable]">
          {errorText}
        </pre>
      )}

      {output && typeof output === "string" && (
        <pre className="w-full max-w-full max-h-48 overflow-auto whitespace-pre-wrap break-words rounded border border-editorial-hairline bg-editorial-surface-soft/50 px-2.5 py-2 text-[12px] leading-[1.5] text-editorial-ink-soft font-mono [scrollbar-gutter:stable]">
          {output}
        </pre>
      )}

      {output && typeof output !== "string" && <div>{output}</div>}
    </div>
  );
}

/* ── 工具函数 ── */
function formatPayload(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
