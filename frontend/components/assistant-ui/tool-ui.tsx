"use client";

import { useState } from "react";
import { makeAssistantToolUI } from "@assistant-ui/react";
import { Search, Loader2, Check, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { openPreview } from "@/lib/preview-events";

interface ToolCardProps {
  icon: React.ReactNode;
  title: string;
  status: "running" | "complete" | "error" | "pending";
  action?: React.ReactNode;
  children?: React.ReactNode;
}

function ToolCard({ icon, title, status, action, children }: ToolCardProps) {
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
        <div className="flex min-h-5 items-center gap-1.5">
          <span className="font-medium text-[#1d1d1f]">{title}</span>
          <div className="shrink-0">{statusIcon}</div>
          {action && <div className="ml-auto shrink-0">{action}</div>}
        </div>
        {children && (
          <div className="mt-1.5 text-[11px] text-[#86868b]">{children}</div>
        )}
      </div>
    </div>
  );
}

type WebSearchItem = {
  title?: string;
  url?: string;
  content?: string;
  raw_content?: string;
  score?: number;
};

type WebSearchResult = {
  answer?: string;
  result_count?: number;
  results?: WebSearchItem[];
  search_results?: WebSearchItem[];
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

function readSearchResults(payload: WebSearchResult): WebSearchItem[] {
  return payload.results ?? payload.search_results ?? [];
}

const toolStatusMap: Record<string, ToolCardProps["status"]> = {
  running: "running",
  complete: "complete",
  incomplete: "error",
};

function toToolCardStatus(status: { type: string }): ToolCardProps["status"] {
  return toolStatusMap[status.type] ?? "pending";
}

function readSearchItemSummary(item: WebSearchItem): string {
  return (item.raw_content || item.content || "").trim();
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
  const cardStatus = toToolCardStatus(status);
  const payload = readWebSearchResult(result);
  const results = readSearchResults(payload);
  const resultCount = payload.result_count ?? results.length;
  const query = typeof args?.query === "string" ? args.query : undefined;
  const [manuallyExpanded, setManuallyExpanded] = useState(false);
  const hasResults = results.length > 0;
  const expanded = hasResults && manuallyExpanded;

  return (
    <ToolCard
      icon={<Search size={12} className="text-[#0071e3]" strokeWidth={2} />}
      title="网络搜索"
      status={cardStatus}
      action={
        hasResults ? (
          <button
            type="button"
            className="grid h-5 w-5 place-items-center rounded-md text-[#86868b] transition-colors hover:bg-[#f5f5f7] hover:text-[#1d1d1f]"
            title={expanded ? "收起搜索结果" : "展开搜索结果"}
            onClick={() => setManuallyExpanded((value) => !value)}
          >
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        ) : null
      }
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {query && <span className="break-all text-[#0071e3]">“{query}”</span>}
        {cardStatus === "running" && <span>搜索中</span>}
        {hasResults && <span>找到 {resultCount} 条结果</span>}
      </div>

      {expanded && (
        <div className="mt-2 space-y-2">
          {results.map((item, index) => {
            const summary = readSearchItemSummary(item);
            const title = item.title || `搜索结果 ${index + 1}`;

            return (
              <button
                key={`${item.url ?? title}-${index}`}
                type="button"
                className="block w-full rounded-lg bg-[#f5f5f7] px-2.5 py-2 text-left transition-colors hover:bg-[#e8e8ed]"
                onClick={() => {
                  openPreview({
                    title: item.title,
                    url: item.url,
                    content: summary,
                    source: item.url || "搜索结果",
                  });
                }}
              >
                <div className="truncate text-[11px] font-medium text-[#0066cc]">{title}</div>
                {summary && (
                  <p className="mt-1 line-clamp-3 text-[11px] leading-5 text-[#6e6e73]">
                    {summary}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      )}
    </ToolCard>
  );
}

export const WebSearchToolUI = makeAssistantToolUI<{ query: string }, unknown>({
  toolName: "web_search",
  render: WebSearchToolCard,
});
