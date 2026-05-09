"use client";

import { makeAssistantToolUI } from "@assistant-ui/react";
import { Search, BookOpen, FileText, Loader2, Check, AlertCircle } from "lucide-react";

// ─── 工具卡片通用壳 ───────────────────────────────────────────
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
      {/* 工具图标 */}
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

// ─── Web 搜索工具 ─────────────────────────────────────────────
export const WebSearchToolUI = makeAssistantToolUI<
  { query: string },
  { results?: Array<{ title: string; url: string }> }
>({
  toolName: "web_search",
  render: ({ args, result, status }) => (
    <ToolCard
      icon={<Search size={12} className="text-[#0071e3]" strokeWidth={2} />}
      title="网络搜索"
      status={
        status.type === "running"
          ? "running"
          : status.type === "complete"
          ? "complete"
          : status.type === "incomplete"
          ? "error"
          : "pending"
      }
    >
      {args?.query && <span className="text-[#0071e3]">“{args.query}”</span>}
      {result?.results && (
        <span className="ml-1 text-[#86868b]">· 找到 {result.results.length} 条结果</span>
      )}
    </ToolCard>
  ),
});

// ─── 知识库检索工具 ───────────────────────────────────────────
export const KnowledgeSearchToolUI = makeAssistantToolUI<
  { query: string; knowledge_base?: string },
  { chunks?: number }
>({
  toolName: "knowledge_search",
  render: ({ args, result, status }) => (
    <ToolCard
      icon={<BookOpen size={12} className="text-purple-500" strokeWidth={2} />}
      title="知识库检索"
      status={
        status.type === "running"
          ? "running"
          : status.type === "complete"
          ? "complete"
          : status.type === "incomplete"
          ? "error"
          : "pending"
      }
    >
      {args?.query && <span className="text-purple-500">“{args.query}”</span>}
      {result?.chunks !== undefined && (
        <span className="ml-1 text-[#86868b]">· 召回 {result.chunks} 片段</span>
      )}
    </ToolCard>
  ),
});

// ─── 生成报告工具 ─────────────────────────────────────────────
export const GenerateReportToolUI = makeAssistantToolUI<
  { title: string; format?: string },
  { word_count?: number }
>({
  toolName: "generate_report",
  render: ({ args, result, status }) => (
    <ToolCard
      icon={<FileText size={12} className="text-amber-500" strokeWidth={2} />}
      title="生成报告"
      status={
        status.type === "running"
          ? "running"
          : status.type === "complete"
          ? "complete"
          : status.type === "incomplete"
          ? "error"
          : "pending"
      }
    >
      {args?.title && <span>{args.title}</span>}
      {result?.word_count && (
        <span className="ml-1 text-[#86868b]">· {result.word_count} 字</span>
      )}
    </ToolCard>
  ),
});
