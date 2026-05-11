"use client";

import { makeAssistantToolUI } from "@assistant-ui/react";
import { Search, Loader2, Check, AlertCircle } from "lucide-react";

interface ToolCardProps {
  icon: React.ReactNode;
  title: string;
  status: "running" | "complete" | "error" | "pending";
  children?: React.ReactNode;
}

function ToolCard({ icon, title, status, children }: ToolCardProps) {
  const statusIcon = {
    running: <Loader2 size={13} className="text-[#0071e3] animate-spin" />,
    complete: <Check size={13} className="text-green-500" strokeWidth={2.5} />,
    error: <AlertCircle size={13} className="text-red-400" />,
    pending: <div className="w-3 h-3 rounded-full border border-[#d2d2d7]" />,
  }[status];

  const borderColor = {
    running: "border-[#0071e3]/30",
    complete: "border-[#d2d2d7]",
    error: "border-red-200",
    pending: "border-[#d2d2d7]",
  }[status];

  return (
    <div
      className={`flex items-start gap-2.5 px-3 py-2.5 rounded-xl border bg-white
                  text-[12px] text-[#1d1d1f] my-1.5 ${borderColor}`}
    >
      <div className="w-5 h-5 rounded-md bg-[#f5f5f7] flex items-center justify-center shrink-0 mt-0.5">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-[#1d1d1f]">{title}</span>
          {statusIcon}
        </div>
        {children && (
          <div className="mt-1 text-[11px] text-[#86868b] truncate">{children}</div>
        )}
      </div>
    </div>
  );
}

type WebSearchResult = {
  answer?: string;
  result_count?: number;
  results?: unknown[];
  summary?: string;
};

function readWebSearchResult(result: unknown): WebSearchResult {
  if (typeof result === "string") {
    try {
      const parsed = JSON.parse(result);
      return parsed && typeof parsed === "object" ? (parsed as WebSearchResult) : {};
    } catch {
      return { summary: result };
    }
  }

  if (result && typeof result === "object") return result as WebSearchResult;
  return {};
}

const toolStatusMap: Record<string, ToolCardProps["status"]> = {
  running: "running",
  complete: "complete",
  incomplete: "error",
};

function toToolCardStatus(status: { type: string }): ToolCardProps["status"] {
  return toolStatusMap[status.type] ?? "pending";
}

function WebSearchToolCard({
  args,
  result,
  status,
}: {
  args?: Record<string, unknown>;
  result?: unknown;
  status: { type: string };
}) {
  const payload = readWebSearchResult(result);
  const resultCount = payload.result_count ?? payload.results?.length;
  const summary = payload.answer || payload.summary;
  const query = typeof args?.query === "string" ? args.query : undefined;

  return (
    <ToolCard
      icon={<Search size={12} className="text-[#0071e3]" strokeWidth={2} />}
      title="网络搜索"
      status={toToolCardStatus(status)}
    >
      {query && <span className="text-[#0071e3]">“{query}”</span>}
      {typeof resultCount === "number" && (
        <span className="ml-1 text-[#86868b]">· 找到 {resultCount} 条结果</span>
      )}
      {summary && <div className="mt-1 text-[#86868b] line-clamp-2">{summary}</div>}
    </ToolCard>
  );
}

export const WebSearchToolUI = makeAssistantToolUI<{ query: string }, unknown>({
  toolName: "web_search",
  render: WebSearchToolCard,
});
