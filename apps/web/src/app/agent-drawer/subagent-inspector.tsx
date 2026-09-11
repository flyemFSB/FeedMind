import { useEffect, useRef, useState } from "react";
import { m, AnimatePresence } from "motion/react";
import {
  X,
  Bot,
  Search,
  FileSpreadsheet,
  FileText,
  Globe,
  Clock,
  Coins,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  ChevronDown,
  Wrench,
  Sparkles,
} from "lucide-react";
import {
  useSubagentInspector,
  type SubagentTaskData,
} from "@/app/agent-drawer/subagent-inspector-context";
import { MessageResponse } from "@/components/ai-elements/message";
import { cn } from "@/lib/utils";
import { drawerContentVariants, backdropVariants } from "@/lib/motion";
import { useTranslation } from "react-i18next";

function getSubagentMeta(type: string) {
  switch (type) {
    case "researcher":
      return {
        name: "深度研究员 (Researcher)",
        icon: Search,
        desc: "专注于多角度信息收集、网页检索与综合研究报告撰写",
        color:
          "text-blue-600 bg-blue-50 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800",
      };
    case "extractor":
      return {
        name: "数据提取器 (Extractor)",
        icon: FileSpreadsheet,
        desc: "专注于从杂乱页面或文本中抽取结构化字段与关键数据",
        color:
          "text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800",
      };
    case "summarizer":
      return {
        name: "文本摘要器 (Summarizer)",
        icon: FileText,
        desc: "专注于长篇内容的高密度压缩、提炼关键论点与核心观点",
        color:
          "text-emerald-600 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800",
      };
    case "browser":
      return {
        name: "浏览器自动化 (Browser)",
        icon: Globe,
        desc: "运行于沙盒环境，执行 DOM 快照、网页点击、表单填写与截图",
        color:
          "text-purple-600 bg-purple-50 border-purple-200 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-800",
      };
    default:
      return {
        name: `Subagent (${type})`,
        icon: Bot,
        desc: "专用任务子智能体",
        color: "text-editorial-ink-muted bg-editorial-surface-soft border-editorial-hairline",
      };
  }
}

export function SubagentInspector() {
  const { isOpen, activeTask, closeInspector } = useSubagentInspector();
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeInspector();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, closeInspector]);

  return (
    <AnimatePresence>
      {isOpen && activeTask && (
        <div className="fixed inset-0 z-50 flex justify-end overflow-hidden">
          {/* 背景遮罩 */}
          <m.div
            initial="closed"
            animate="open"
            exit="closed"
            variants={backdropVariants}
            // eslint-disable-next-line react-doctor/click-events-have-key-events -- 装饰性遮罩：点击关闭仅为便捷，键盘路径由组件级 Escape 监听提供
            onClick={closeInspector}
            className="absolute inset-0 bg-black/30"
          />

          {/* 抽屉面板 */}
          <m.div
            ref={drawerRef}
            initial="closed"
            animate="open"
            exit="closed"
            variants={drawerContentVariants}
            className="relative flex h-full w-full max-w-2xl flex-col border-l border-editorial-hairline bg-editorial-surface-card shadow-2xl"
          >
            <SubagentInspectorContent task={activeTask} onClose={closeInspector} />
          </m.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function SubagentInspectorContent({
  task,
  onClose,
}: {
  task: SubagentTaskData;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const meta = getSubagentMeta(task.type);
  const Icon = meta.icon;
  const [copied, setCopied] = useState(false);

  const handleCopyResult = () => {
    if (!task.result) return;
    void navigator.clipboard.writeText(task.result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isCompleted = Boolean(task.result && !task.errorText);
  const isError = Boolean(task.errorText);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* 头部区 */}
      <div className="flex shrink-0 items-center justify-between border-b border-editorial-hairline bg-editorial-surface-soft/60 px-5 py-3.5">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex size-9 items-center justify-center rounded-lg border shadow-xs",
              meta.color,
            )}
          >
            <Icon size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-editorial-ink text-sm">{meta.name}</span>
              {isCompleted && (
                <span className="flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 font-medium text-[11px] text-green-600 dark:text-green-400">
                  <CheckCircle2 size={12} />
                  已完成
                </span>
              )}
              {isError && (
                <span className="flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 font-medium text-[11px] text-red-600 dark:text-red-400">
                  <AlertCircle size={12} />
                  异常
                </span>
              )}
            </div>
            <p className="text-editorial-ink-muted text-xs">{meta.desc}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="flex size-7 items-center justify-center rounded-md text-editorial-ink-muted transition-colors hover:bg-editorial-surface-strong hover:text-editorial-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          aria-label="关闭观测面板"
        >
          <X size={16} />
        </button>
      </div>

      {/* 性能与消耗看板 */}
      <div className="flex shrink-0 items-center gap-4 border-b border-editorial-hairline bg-editorial-surface-soft/30 px-5 py-2 text-xs text-editorial-ink-soft">
        {task.duration !== undefined && (
          <div className="flex items-center gap-1.5 font-mono">
            <Clock size={13} className="text-editorial-ink-muted" />
            <span>
              耗时:{" "}
              {task.duration > 1000
                ? `${(task.duration / 1000).toFixed(2)}s`
                : `${task.duration}ms`}
            </span>
          </div>
        )}
        {task.usage && (
          <div className="flex items-center gap-1.5 font-mono">
            <Coins size={13} className="text-editorial-ink-muted" />
            <span>
              Tokens: In {task.usage.inputTokens ?? 0} / Out {task.usage.outputTokens ?? 0} (共{" "}
              {task.usage.totalTokens ?? 0})
            </span>
          </div>
        )}
        {task.taskId && (
          <div className="ml-auto font-mono text-[11px] text-editorial-ink-muted">
            ID: {task.taskId}
          </div>
        )}
      </div>

      {/* 主滚动区域 */}
      <div className="flex-1 space-y-5 overflow-y-auto p-5 text-xs">
        {/* 1. 任务指令 Mission */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 font-medium text-editorial-ink text-xs">
            <Sparkles size={14} className="text-editorial-accent" />
            <span>委派任务指令 (Task Prompt)</span>
          </div>
          <div className="rounded-lg border border-editorial-hairline bg-editorial-surface-soft/50 p-3 text-editorial-ink leading-relaxed">
            <p className="whitespace-pre-wrap select-text">{task.prompt}</p>
            {task.context && (
              <div className="mt-2.5 border-t border-editorial-hairline/60 pt-2 text-editorial-ink-muted">
                <span className="font-medium text-[11px]">上下文背景 (Context):</span>
                <p className="mt-1 whitespace-pre-wrap select-text">{task.context}</p>
              </div>
            )}
          </div>
        </div>

        {/* 2. 内部子工具调用链 Child Tool Calls */}
        {task.childTools && task.childTools.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 font-medium text-editorial-ink text-xs">
              <Wrench size={14} className="text-editorial-accent" />
              <span>内部工具调用链 ({task.childTools.length} 次操作)</span>
            </div>
            <div className="space-y-2">
              {task.childTools.map((ct, idx) => (
                <ChildToolCard
                  key={ct.toolCallId ?? `${ct.toolName}:${JSON.stringify(ct.args ?? "")}`}
                  tool={ct}
                  index={idx}
                />
              ))}
            </div>
          </div>
        )}

        {/* 3. 任务执行产出 Output */}
        {task.result && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-medium text-editorial-ink text-xs">
                <CheckCircle2 size={14} className="text-green-600 dark:text-green-400" />
                <span>任务交付产出 (Execution Result)</span>
              </div>
              <button
                type="button"
                onClick={handleCopyResult}
                className="flex items-center gap-1 rounded-md border border-editorial-hairline bg-editorial-surface-card px-2 py-1 text-[11px] text-editorial-ink-soft transition-colors hover:bg-editorial-surface-soft hover:text-editorial-ink"
              >
                {copied ? <Check size={12} className="text-green-600" /> : <Copy size={12} />}
                <span>{copied ? "已复制" : t("common.copy")}</span>
              </button>
            </div>
            <div className="rounded-lg border border-editorial-hairline bg-editorial-surface-soft/30 p-4 text-editorial-ink leading-relaxed shadow-xs">
              <MessageResponse>{task.result}</MessageResponse>
            </div>
          </div>
        )}

        {/* 4. 错误信息展示 */}
        {task.errorText && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
            <div className="flex items-center gap-2 font-medium">
              <AlertCircle size={15} />
              <span>执行失败</span>
            </div>
            <p className="mt-1 text-xs">{task.errorText}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ChildToolCard({
  tool,
  index,
}: {
  tool: SubagentTaskData["childTools"] extends (infer U)[] | undefined ? U : never;
  index: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-md border border-editorial-hairline bg-editorial-surface-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-xs transition-colors hover:bg-editorial-surface-soft/60"
      >
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-editorial-ink-muted">#{index + 1}</span>
          <span className="font-semibold text-editorial-ink">{tool.toolName}</span>
          {tool.isError ? (
            <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] text-red-600 dark:bg-red-950/50 dark:text-red-400">
              失败
            </span>
          ) : (
            <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] text-green-600 dark:bg-green-950/50 dark:text-green-400">
              成功
            </span>
          )}
        </div>
        <ChevronDown
          size={14}
          className={cn(
            "text-editorial-ink-muted transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="border-t border-editorial-hairline/60 bg-editorial-surface-soft/30 p-3 space-y-2 text-[11px] font-mono leading-relaxed">
          {tool.args !== undefined && (
            <div>
              <div className="text-editorial-ink-muted font-sans font-medium mb-0.5">输入:</div>
              <pre className="max-h-32 overflow-auto rounded bg-editorial-surface-card p-2 text-editorial-ink-soft whitespace-pre-wrap break-all border border-editorial-hairline/40">
                {typeof tool.args === "object"
                  ? JSON.stringify(tool.args, null, 2)
                  : String(tool.args)}
              </pre>
            </div>
          )}
          {tool.result !== undefined && (
            <div>
              <div className="text-editorial-ink-muted font-sans font-medium mb-0.5">输出:</div>
              <pre className="max-h-36 overflow-auto rounded bg-editorial-surface-card p-2 text-editorial-ink-soft whitespace-pre-wrap break-all border border-editorial-hairline/40">
                {typeof tool.result === "object"
                  ? JSON.stringify(tool.result, null, 2)
                  : String(tool.result)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
