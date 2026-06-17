/**
 * ai-elements Tool — Agent 工具调用可视化
 *
 * AI SDK v6: part.type === "tool-{toolName}"
 * 支持流式输入、调用中、结果就绪、执行出错四种状态。
 *
 * @see https://mastra.ai/guides/build-your-ui/ai-sdk-ui
 */
"use client";

import { useState, useEffect, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { Wrench, Check, AlertCircle, ChevronDown, Brain } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "motion/react";

export type ToolStatus = "streaming" | "running" | "complete" | "error";

export type ToolProps = HTMLAttributes<HTMLDivElement> & {
  toolName: string;
  status?: ToolStatus;
  args?: string;
  result?: string;
  isError?: boolean;
  /**
   * 调用此工具前的推理/思考内容。
   * 在 ThinkingProcess 中，每个 tool-* part 之前最近的 reasoning part 文本。
   */
  thought?: string;
};

/* -------------------------------------------------------------------------- */
/* Tool — 单条工具调用 */
/* -------------------------------------------------------------------------- */
export function Tool({
  className,
  toolName,
  status = "running",
  args,
  result,
  isError = false,
  thought,
  ...props
}: ToolProps) {
  const { t } = useTranslation();
  const resolvedStatus: ToolStatus = isError ? "error" : status;
  const [open, setOpen] = useState(false);
  const [thoughtOpen, setThoughtOpen] = useState(false);

  // 流式/调用中时自动展开，完成后自动收起
  useEffect(() => {
    if (resolvedStatus === "streaming" || resolvedStatus === "running") {
      setOpen(true);
    } else {
      // 完成或出错后短暂延迟收起
      const timer = setTimeout(() => setOpen(false), 600);
      return () => clearTimeout(timer);
    }
  }, [resolvedStatus]);

  const hasArgs = args?.trim() && args.trim() !== "{}" && args.trim() !== '""';
  const hasResult = result?.trim() && result.trim() !== "{}" && result.trim() !== '""';

  /* ---- Status icon ---- */
  const Icon = {
    streaming: () => (
      <span className="flex items-center gap-[2px]">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="inline-block h-[3px] w-[3px] rounded-full bg-editorial-ink-muted"
            animate={{ opacity: [0.25, 1, 0.25] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
          />
        ))}
      </span>
    ),
    running: () => (
      <motion.span
        className="flex items-center justify-center"
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
      >
        <Wrench size={12} className="text-editorial-ink-muted" />
      </motion.span>
    ),
    complete: () => (
      <span className="flex items-center justify-center rounded-full bg-editorial-surface-strong p-[2px]">
        <Check size={10} className="text-editorial-ink-soft" />
      </span>
    ),
    error: () => <AlertCircle size={12} className="text-editorial-semantic-error" />,
  }[resolvedStatus];

  /* ---- Status label ---- */
  const statusLabel = {
    streaming: t("chat.toolStreaming"),
    running: t("chat.toolRunning"),
    complete: t("chat.toolComplete"),
    error: t("common.error"),
  }[resolvedStatus];

  return (
    <div className={cn("group", className)} {...props}>
      {/* 标题行 */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors",
          "hover:bg-editorial-surface-soft",
          resolvedStatus === "error" && "bg-editorial-semantic-error/5",
        )}
      >
        {/* 展开/折叠箭头 */}
        <motion.span
          animate={{ rotate: open ? 0 : -90 }}
          transition={{ duration: 0.15 }}
          className="shrink-0"
        >
          <ChevronDown size={12} className="text-editorial-ink-muted" />
        </motion.span>

        {/* 状态图标 */}
        <span className="flex h-4 w-4 shrink-0 items-center justify-center">
          <Icon />
        </span>

        {/* 工具名 + 状态 */}
        <span className="flex-1 truncate font-medium text-editorial-ink">{toolName}</span>
        <span className="shrink-0 text-[11px] text-editorial-ink-muted font-normal">
          {statusLabel}
        </span>
      </button>

      {/* 可展开详情 */}
      <AnimatePresence initial={false}>
        {open && (hasArgs || hasResult || !!thought) && (
          <motion.div
            key="tool-details"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="space-y-1.5 px-3 pb-2 pt-1">
              {/* Thought section — 调用此工具前的模型思考 */}
              {!!thought && (
                <div>
                  <button
                    type="button"
                    onClick={() => setThoughtOpen(!thoughtOpen)}
                    className={cn(
                      "mb-0.5 flex items-center gap-1.5 text-[11px] font-medium tracking-wide uppercase transition-colors",
                      "text-editorial-ink-muted hover:text-editorial-ink",
                    )}
                  >
                    <motion.span
                      animate={{ rotate: thoughtOpen ? 0 : -90 }}
                      transition={{ duration: 0.12 }}
                    >
                      <ChevronDown size={10} />
                    </motion.span>
                    <Brain size={10} />
                    <span>{t("chat.toolThought")}</span>
                  </button>
                  <AnimatePresence initial={false}>
                    {thoughtOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        className="overflow-hidden"
                      >
                        <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded border border-editorial-hairline bg-editorial-surface-soft/30 px-2.5 py-2 text-[12px] leading-[1.6] text-editorial-ink-soft font-mono italic">
                          {thought}
                        </pre>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {hasArgs && (
                <div>
                  <div className="mb-0.5 text-[11px] font-medium text-editorial-ink-muted tracking-wide uppercase">
                    {t("chat.toolArgs")}
                  </div>
                  <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded border border-editorial-hairline bg-editorial-surface-soft/50 px-2.5 py-2 text-[12px] leading-[1.5] text-editorial-ink-soft font-mono [scrollbar-gutter:stable]">
                    {args}
                  </pre>
                </div>
              )}
              {hasResult && (
                <div>
                  <div
                    className={cn(
                      "mb-0.5 text-[11px] font-medium tracking-wide uppercase",
                      isError ? "text-editorial-semantic-error" : "text-editorial-ink-muted",
                    )}
                  >
                    {isError ? t("common.error") : t("chat.toolResult")}
                  </div>
                  <pre
                    className={cn(
                      "max-h-48 overflow-auto whitespace-pre-wrap break-words rounded border px-2.5 py-2 text-[12px] leading-[1.5] font-mono [scrollbar-gutter:stable]",
                      isError
                        ? "border-editorial-semantic-error/20 bg-editorial-semantic-error/5 text-editorial-semantic-error"
                        : "border-editorial-hairline bg-editorial-surface-soft/50 text-editorial-ink-soft",
                    )}
                  >
                    {result}
                  </pre>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
