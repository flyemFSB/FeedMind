/**
 * ai-elements Reasoning — Agent 思考过程展示
 *
 * 流式思考时自动展开并显示动态指示器。
 * 完成后可折叠，保持聊天界面的整洁。
 *
 * AI SDK v6: part.type === "reasoning"
 * @see https://ai-sdk.dev/docs/ai-sdk-ui/chatbot#reasoning
 */
"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useId,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "motion/react";

/* -------------------------------------------------------------------------- */
/* Context */
/* -------------------------------------------------------------------------- */
interface ReasoningContextValue {
  isStreaming: boolean;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

const ReasoningContext = createContext<ReasoningContextValue | null>(null);

export function useReasoning() {
  const ctx = useContext(ReasoningContext);
  if (!ctx) throw new Error("useReasoning must be used within Reasoning");
  return ctx;
}

/* -------------------------------------------------------------------------- */
/* Thinking Dots */
/* -------------------------------------------------------------------------- */
function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-[3px]" aria-label="思考中">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="inline-block h-1 w-1 rounded-full bg-editorial-ink-muted"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{
            duration: 1.4,
            repeat: Infinity,
            delay: i * 0.25,
            ease: "easeInOut",
          }}
        />
      ))}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Reasoning — 可折叠思考容器 */
/* -------------------------------------------------------------------------- */
export type ReasoningProps = HTMLAttributes<HTMLDivElement> & {
  isStreaming?: boolean;
  defaultOpen?: boolean;
};

export function Reasoning({
  className,
  isStreaming = false,
  defaultOpen = true,
  children,
  ...props
}: ReasoningProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const uid = useId();

  // 流式进行中时保持展开
  useEffect(() => {
    if (isStreaming) setIsOpen(true);
  }, [isStreaming]);

  return (
    <ReasoningContext.Provider value={{ isStreaming, isOpen, setIsOpen }}>
      <div
        className={cn(
          "w-full overflow-hidden rounded-lg border border-editorial-hairline bg-editorial-surface-card",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </ReasoningContext.Provider>
  );
}

/* -------------------------------------------------------------------------- */
/* ReasoningTrigger — 展开/折叠标题栏 */
/* -------------------------------------------------------------------------- */
export type ReasoningTriggerProps = HTMLAttributes<HTMLButtonElement>;

export function ReasoningTrigger({ className, ...props }: ReasoningTriggerProps) {
  const { t } = useTranslation();
  const { isOpen, setIsOpen, isStreaming } = useReasoning();

  return (
    <button
      type="button"
      onClick={() => setIsOpen(!isOpen)}
      className={cn(
        "flex h-9 w-full items-center gap-2 px-3 text-left text-[13px] font-medium text-editorial-ink-soft hover:text-editorial-ink transition-colors",
        isOpen && "border-b border-editorial-hairline",
        className,
      )}
      {...props}
    >
      {/* Chevron icon */}
      <motion.svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        animate={{ rotate: isOpen ? 0 : -90 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="shrink-0 text-editorial-ink-muted"
      >
        <path
          d="M3 4.5L6 7.5L9 4.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </motion.svg>

      <span>{t("chat.thinking")}</span>

      {isStreaming && (
        <span className="ml-auto">
          <ThinkingDots />
        </span>
      )}

      {!isStreaming && isOpen && (
        <span className="ml-auto text-[11px] text-editorial-ink-muted font-normal">
          {/* 可选：显示推理行数或时间 */}
        </span>
      )}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* ReasoningContent — 推理文本区域 */
/* -------------------------------------------------------------------------- */
export type ReasoningContentProps = HTMLAttributes<HTMLDivElement>;

export function ReasoningContent({ className, children }: ReasoningContentProps) {
  const { isOpen } = useReasoning();

  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div
          key="reasoning-panel"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="overflow-hidden"
        >
          <div
            className={cn(
              "px-3 py-2.5 text-[13px] leading-[1.65] text-editorial-ink-soft whitespace-pre-wrap font-[450]",
              "font-mono tracking-[-0.01em]",
              className,
            )}
          >
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
