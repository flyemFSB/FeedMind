import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { Brain, ChevronDown, Loader2 } from "lucide-react";
import type { ComponentProps } from "react";
import { createContext, memo, useContext, useMemo, useState } from "react";

interface ReasoningContextValue {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  isStreaming: boolean;
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
};

export const Reasoning = memo(
  ({ className, isStreaming = false, defaultOpen, children, ...props }: ReasoningProps) => {
    // 默认展开状态优先遵循 defaultOpen，未指定时由流式状态决定
    const [isOpen, setIsOpen] = useState(defaultOpen ?? isStreaming);

    // 流式状态翻转时同步展开状态，避免覆盖用户的手动折叠
    const [prevStreaming, setPrevStreaming] = useState(isStreaming);
    if (isStreaming !== prevStreaming) {
      setPrevStreaming(isStreaming);
      setIsOpen(isStreaming);
    }

    const contextValue = useMemo(() => ({ isOpen, setIsOpen, isStreaming }), [isOpen, isStreaming]);

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
  const { isOpen, setIsOpen, isStreaming } = useReasoning();

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
          <Brain className="size-3.5 transition-colors" />
        )}

        <div className="flex min-w-0 flex-1 items-center gap-1.5 text-left font-medium">
          {children}
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
