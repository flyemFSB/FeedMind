/**
 * ai-elements Reasoning — Agent 思考过程展示
 *
 * 使用 Collapsible 基元构建，对齐官方 Reasoning 组件结构：
 *   Reasoning (Collapsible)
 *     ├─ ReasoningTrigger — "思考过程" + 流式指示器 + 耗时
 *     └─ ReasoningContent — 思考文本
 *
 * 行为：
 * - 流式时自动展开（isStreaming=true）
 * - 流式结束后 1.2s 自动收起（仅一次）
 * - 支持受控 open/onOpenChange
 * - 耗时计时器
 *
 * 与官方差异：
 * - 保留 FeedMind editorial 设计令牌
 * - 保留中文 i18n
 * - 使用 motion 动画替代 Radix Collapsible
 */
"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type ComponentProps,
  type ReactNode,
} from "react";
import { motion, useReducedMotion } from "motion/react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { Brain, ChevronRight } from "lucide-react";
import { motionSpring } from "@/lib/motion";

/* ── Context ── */
interface ReasoningContextValue {
  isStreaming: boolean;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  duration: number | undefined;
}

const ReasoningContext = createContext<ReasoningContextValue | null>(null);

export function useReasoning() {
  const ctx = useContext(ReasoningContext);
  if (!ctx) throw new Error("useReasoning must be used within Reasoning");
  return ctx;
}

/* ── Types ── */
export type ReasoningProps = ComponentProps<typeof Collapsible> & {
  isStreaming?: boolean;
  duration?: number;
};

export type ReasoningTriggerProps = ComponentProps<typeof CollapsibleTrigger> & {
  getThinkingMessage?: (isStreaming: boolean, duration?: number) => ReactNode;
};

export type ReasoningContentProps = ComponentProps<typeof CollapsibleContent> & {
  children: string;
};

/* ── Constants ── */
const AUTO_CLOSE_DELAY = 1200;

/* ── Thinking Dots ── */
function ThinkingDots() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <span className="inline-flex items-center gap-[3px]" aria-label="思考中">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="inline-block h-1 w-1 rounded-full bg-editorial-ink-muted"
          animate={shouldReduceMotion ? { opacity: 0.65 } : { opacity: [0.35, 1, 0.35] }}
          transition={
            shouldReduceMotion
              ? { duration: 0.12 }
              : { duration: 0.9, repeat: Infinity, delay: i * 0.12 }
          }
        />
      ))}
    </span>
  );
}

/* ── Reasoning ── */
export function Reasoning({
  className,
  isStreaming = false,
  duration: externalDuration,
  defaultOpen,
  children,
  ...props
}: ReasoningProps) {
  const defaultOpenResolved = defaultOpen ?? isStreaming;
  const [isOpen, setIsOpen] = useState(defaultOpenResolved);
  const [duration, setDuration] = useState<number | undefined>(externalDuration);
  const hasEverStreamed = useRef(false);
  const [hasAutoClosed, setHasAutoClosed] = useState(false);
  const startTime = useRef<number | null>(null);

  useEffect(() => {
    if (isStreaming) {
      hasEverStreamed.current = true;
      if (startTime.current === null) startTime.current = Date.now();
      setIsOpen(true);
    } else {
      if (startTime.current !== null) {
        setDuration(Math.ceil((Date.now() - startTime.current) / 1000));
        startTime.current = null;
      }
    }
  }, [isStreaming]);

  useEffect(() => {
    if (hasEverStreamed.current && !isStreaming && isOpen && !hasAutoClosed) {
      const timer = setTimeout(() => {
        setIsOpen(false);
        setHasAutoClosed(true);
      }, AUTO_CLOSE_DELAY);
      return () => clearTimeout(timer);
    }
  }, [isStreaming, isOpen, hasAutoClosed]);

  const handleOpenChange = useCallback((next: boolean) => {
    setIsOpen(next);
    if (next) setHasAutoClosed(false);
  }, []);

  const ctxValue = useMemo(
    () => ({ isStreaming, isOpen, setIsOpen: handleOpenChange, duration }),
    [isStreaming, isOpen, handleOpenChange, duration],
  );

  return (
    <ReasoningContext.Provider value={ctxValue}>
      <Collapsible
        open={isOpen}
        onOpenChange={handleOpenChange}
        className={cn(
          "w-full overflow-hidden rounded-lg border border-editorial-hairline bg-editorial-surface-card",
          className,
        )}
        {...props}
      >
        {children}
      </Collapsible>
    </ReasoningContext.Provider>
  );
}

/* ── ReasoningTrigger ── */
const DEFAULT_THINKING_MSG = (isStreaming: boolean, duration?: number) => {
  if (isStreaming) {
    return (
      <>
        <span>思考过程</span>
        <span className="ml-auto">
          <ThinkingDots />
        </span>
      </>
    );
  }
  if (duration !== undefined) {
    return <span>思考过程（{duration} 秒）</span>;
  }
  return <span>思考过程</span>;
};

export function ReasoningTrigger({
  className,
  getThinkingMessage = DEFAULT_THINKING_MSG,
  ...props
}: ReasoningTriggerProps) {
  const { isStreaming, duration, isOpen } = useReasoning();

  return (
    <CollapsibleTrigger
      className={cn(
        "flex h-9 w-full items-center gap-2 px-3 text-left text-[13px] font-medium text-editorial-ink-soft hover:text-editorial-ink",
        isOpen && "border-b border-editorial-hairline",
        className,
      )}
      {...props}
    >
      <motion.span animate={{ rotate: isOpen ? 90 : 0 }} transition={motionSpring}>
        <ChevronRight size={14} className="shrink-0 text-editorial-ink-muted" />
      </motion.span>
      <Brain size={14} className="shrink-0 text-editorial-ink-muted" />
      {getThinkingMessage(isStreaming, duration)}
    </CollapsibleTrigger>
  );
}

/* ── ReasoningContent ── */
export function ReasoningContent({ className, children }: ReasoningContentProps) {
  return (
    <CollapsibleContent
      className={cn(
        "px-3 py-2.5 text-[13px] leading-[1.65] text-editorial-ink-soft whitespace-pre-wrap font-[450]",
        "font-mono tracking-[-0.01em]",
        className,
      )}
    >
      {children}
    </CollapsibleContent>
  );
}
