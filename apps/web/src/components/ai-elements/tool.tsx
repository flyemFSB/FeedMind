import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { Check, CheckCircle2, ChevronDown, Copy, Loader2, Wrench, XCircle } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { createContext, memo, useCallback, useContext, useMemo, useState } from "react";

export type ToolState = "running" | "output-available" | "output-error";

interface ToolContextValue {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  state?: ToolState;
  toolName: string;
}

const ToolContext = createContext<ToolContextValue | null>(null);

export const useTool = () => {
  const context = useContext(ToolContext);
  if (!context) {
    throw new Error("Tool components must be used within Tool");
  }
  return context;
};

export type ToolProps = ComponentProps<"div"> & {
  toolName: string;
  state?: ToolState;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export const Tool = memo(
  ({
    className,
    toolName,
    state = "output-available",
    open,
    defaultOpen = false,
    onOpenChange,
    children,
    ...props
  }: ToolProps) => {
    const isControlled = open !== undefined;
    const [internalOpen, setInternalOpen] = useState(defaultOpen);
    const isOpen = isControlled ? open : internalOpen;

    const setIsOpen = useCallback(
      (next: boolean) => {
        if (!isControlled) setInternalOpen(next);
        onOpenChange?.(next);
      },
      [isControlled, onOpenChange],
    );

    const contextValue = useMemo(
      () => ({
        isOpen,
        setIsOpen,
        state,
        toolName,
      }),
      [isOpen, setIsOpen, state, toolName],
    );

    return (
      <ToolContext.Provider value={contextValue}>
        <div
          className={cn(
            "not-prose w-full rounded-md border border-editorial-hairline bg-editorial-surface-card transition-colors shadow-2xs",
            className,
          )}
          {...props}
        >
          {children}
        </div>
      </ToolContext.Provider>
    );
  },
);

Tool.displayName = "Tool";

export type ToolHeaderProps = ComponentProps<typeof CollapsibleTrigger> & {
  title?: string;
  icon?: ReactNode;
};

export const ToolHeader = memo(
  ({ className, title, icon, children, ...props }: ToolHeaderProps) => {
    const { isOpen, setIsOpen, state, toolName } = useTool();

    const isRunning = state === "running";
    const isError = state === "output-error";

    return (
      <Collapsible onOpenChange={setIsOpen} open={isOpen}>
        <CollapsibleTrigger
          className={cn(
            "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-editorial-surface-soft/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent rounded-md",
            className,
          )}
          {...props}
        >
          <div className="flex shrink-0 items-center justify-center text-editorial-ink-muted">
            {icon ?? <Wrench className="size-3.5" />}
          </div>

          <span className="font-mono font-medium text-editorial-ink text-[12px] truncate">
            {title ?? toolName}
          </span>

          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            {isRunning ? (
              <Loader2 className="size-3 animate-spin text-editorial-accent" />
            ) : isError ? (
              <XCircle className="size-3.5 text-editorial-semantic-error" />
            ) : (
              <CheckCircle2 className="size-3.5 text-editorial-semantic-success" />
            )}

            <ChevronDown
              className={cn(
                "size-3.5 text-editorial-ink-muted transition-transform duration-200",
                isOpen && "rotate-180",
              )}
            />
          </div>
          {children}
        </CollapsibleTrigger>
      </Collapsible>
    );
  },
);

ToolHeader.displayName = "ToolHeader";

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = memo(({ className, children, ...props }: ToolContentProps) => {
  const { isOpen } = useTool();

  return (
    <Collapsible open={isOpen}>
      <CollapsibleContent
        className={cn(
          "border-t border-editorial-hairline/80 bg-editorial-surface-soft/30 p-2.5 space-y-2 text-xs",
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

ToolContent.displayName = "ToolContent";

export type ToolInputProps = ComponentProps<"div"> & {
  input: unknown;
};

export const ToolInput = memo(({ className, input, ...props }: ToolInputProps) => {
  const [copied, setCopied] = useState(false);

  const rawString = useMemo(() => {
    if (input === undefined || input === null) return "";
    return typeof input === "object" ? JSON.stringify(input, null, 2) : String(input);
  }, [input]);

  const handleCopy = useCallback(() => {
    if (!rawString) return;
    void navigator.clipboard.writeText(rawString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [rawString]);

  if (input === undefined || input === null) return null;

  return (
    <div className={cn("space-y-1", className)} {...props}>
      <div className="flex items-center justify-between text-[11px] font-medium text-editorial-ink-muted">
        <span>输入参数</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-editorial-ink-muted hover:bg-editorial-surface-strong hover:text-editorial-ink transition-colors"
          title="复制输入参数"
        >
          {copied ? (
            <Check className="size-3 text-editorial-semantic-success" />
          ) : (
            <Copy className="size-3" />
          )}
          <span>{copied ? "已复制" : "复制"}</span>
        </button>
      </div>
      <pre className="max-h-32 overflow-auto rounded border border-editorial-hairline/60 bg-editorial-surface-card p-2 text-[11px] font-mono text-editorial-ink-soft whitespace-pre-wrap break-all leading-relaxed">
        {rawString}
      </pre>
    </div>
  );
});

ToolInput.displayName = "ToolInput";

export type ToolOutputProps = ComponentProps<"div"> & {
  output?: unknown;
  errorText?: string;
  isError?: boolean;
};

export const ToolOutput = memo(
  ({ className, output, errorText, isError, children, ...props }: ToolOutputProps) => {
    const [copied, setCopied] = useState(false);

    const outputString = useMemo(() => {
      if (errorText) return errorText;
      if (output === undefined || output === null) return "";
      return typeof output === "object" ? JSON.stringify(output, null, 2) : String(output);
    }, [output, errorText]);

    const handleCopy = useCallback(() => {
      if (!outputString) return;
      void navigator.clipboard.writeText(outputString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }, [outputString]);

    return (
      <div className={cn("space-y-1", className)} {...props}>
        <div className="flex items-center justify-between text-[11px] font-medium text-editorial-ink-muted">
          <span className={isError ? "text-editorial-semantic-error" : ""}>
            {isError ? "执行异常" : "执行产出"}
          </span>
          {outputString && (
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-editorial-ink-muted hover:bg-editorial-surface-strong hover:text-editorial-ink transition-colors"
              title="复制执行产出"
            >
              {copied ? (
                <Check className="size-3 text-editorial-semantic-success" />
              ) : (
                <Copy className="size-3" />
              )}
              <span>{copied ? "已复制" : "复制"}</span>
            </button>
          )}
        </div>

        {children ??
          (isError ? (
            <div className="rounded border border-editorial-semantic-error/25 bg-editorial-semantic-error/10 p-2 text-[11px] font-mono text-editorial-semantic-error whitespace-pre-wrap break-all">
              {errorText || outputString || "工具调用执行失败"}
            </div>
          ) : (
            <pre className="max-h-40 overflow-auto rounded border border-editorial-hairline/60 bg-editorial-surface-card p-2 text-[11px] font-mono text-editorial-ink-soft whitespace-pre-wrap break-all leading-relaxed">
              {outputString || "（无返回值）"}
            </pre>
          ))}
      </div>
    );
  },
);

ToolOutput.displayName = "ToolOutput";
