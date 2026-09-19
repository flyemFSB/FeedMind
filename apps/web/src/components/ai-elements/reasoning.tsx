import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { cn } from "@/lib/utils";
import { Brain, ChevronDown, Loader2 } from "lucide-react";
import type { ComponentProps } from "react";
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

interface ReasoningContextValue {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  isStreaming: boolean;
  duration?: number | undefined;
}

const ReasoningContext = createContext<ReasoningContextValue | null>(null);

export const useReasoning = () => {
  const context = useContext(ReasoningContext);
  if (!context) {
    throw new Error("Reasoning components must be used within Reasoning");
  }
  return context;
};

export type ReasoningProps = ComponentProps<"div"> & {
  isStreaming?: boolean;
  defaultOpen?: boolean;
  /** 已完成的思考耗时（毫秒），缺省时由组件内部在流式期间自动计时 */
  duration?: number;
};

export const Reasoning = memo(
  ({
    className,
    isStreaming = false,
    defaultOpen,
    duration: externalDuration,
    children,
    ...props
  }: ReasoningProps) => {
    // 默认展开状态优先遵循 defaultOpen，未指定时由流式状态决定
    const [isOpen, setIsOpen] = useState(defaultOpen ?? isStreaming);
    const [elapsedMs, setElapsedMs] = useState<number | undefined>(externalDuration);
    const startTimeRef = useRef<number | null>(null);

    useEffect(() => {
      if (externalDuration !== undefined) {
        setElapsedMs(externalDuration);
        return undefined;
      }

      if (isStreaming) {
        startTimeRef.current = performance.now();
        setIsOpen(true);

        const timer = setInterval(() => {
          if (startTimeRef.current !== null) {
            setElapsedMs(Math.round(performance.now() - startTimeRef.current));
          }
        }, 100);

        return () => {
          clearInterval(timer);
          if (startTimeRef.current !== null) {
            setElapsedMs(Math.round(performance.now() - startTimeRef.current));
          }
        };
      }

      // 流式结束且未传入外部耗时：固化最后记录的耗时
      if (startTimeRef.current !== null) {
        setElapsedMs(Math.round(performance.now() - startTimeRef.current));
        startTimeRef.current = null;
        setIsOpen(false);
      }
      return undefined;
    }, [isStreaming, externalDuration]);

    const handleOpenChange = useCallback((next: boolean) => setIsOpen(next), []);

    const contextValue = useMemo(
      () => ({
        isOpen,
        setIsOpen: handleOpenChange,
        isStreaming,
        duration: externalDuration ?? elapsedMs,
      }),
      [isOpen, handleOpenChange, isStreaming, externalDuration, elapsedMs],
    );

    return (
      <ReasoningContext.Provider value={contextValue}>
        <div className={cn("not-prose w-full space-y-2", className)} {...props}>
          {children}
        </div>
      </ReasoningContext.Provider>
    );
  },
);

Reasoning.displayName = "Reasoning";

export type ReasoningTriggerProps = ComponentProps<typeof CollapsibleTrigger>;

export const ReasoningTrigger = memo(({ className, children, ...props }: ReasoningTriggerProps) => {
  const { isOpen, setIsOpen, isStreaming, duration } = useReasoning();

  const formattedDuration = useMemo(() => {
    if (!duration || duration <= 0) return null;
    return `${(duration / 1000).toFixed(1)} 秒`;
  }, [duration]);

  return (
    <Collapsible onOpenChange={setIsOpen} open={isOpen}>
      <CollapsibleTrigger
        className={cn(
          "group flex w-full items-center gap-2 rounded-md py-1 text-xs text-editorial-ink-muted transition-colors hover:text-editorial-ink",
          className,
        )}
        {...props}
      >
        {isStreaming ? (
          <Loader2 className="size-3.5 animate-spin text-editorial-accent" />
        ) : (
          <Brain className="size-3.5 text-editorial-ink-muted transition-colors group-hover:text-editorial-ink" />
        )}

        <div className="flex flex-1 items-center gap-1.5 text-left font-medium">
          {children ??
            (isStreaming ? (
              <Shimmer duration={1.5}>正在深度思考...</Shimmer>
            ) : (
              <span>
                已深度思考
                {formattedDuration ? ` · 耗时 ${formattedDuration}` : ""}
              </span>
            ))}
        </div>

        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-editorial-ink-muted transition-transform duration-200",
            isOpen && "rotate-180",
          )}
        />
      </CollapsibleTrigger>
    </Collapsible>
  );
});

ReasoningTrigger.displayName = "ReasoningTrigger";

export type ReasoningContentProps = ComponentProps<typeof CollapsibleContent>;

export const ReasoningContent = memo(({ className, children, ...props }: ReasoningContentProps) => {
  const { isOpen } = useReasoning();

  return (
    <Collapsible open={isOpen}>
      <CollapsibleContent
        className={cn(
          "relative mt-1 border-l-2 border-editorial-hairline py-1 pl-3 font-mono text-xs leading-relaxed text-editorial-ink-soft",
          "data-[open]:slide-in-from-top-1 outline-none data-[open]:animate-in data-[ending-style]:animate-out data-[ending-style]:fade-out-0",
          className,
        )}
        {...props}
      >
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
});

ReasoningContent.displayName = "ReasoningContent";
