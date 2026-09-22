import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CheckCircle2, HelpCircle, XCircle } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { createContext, memo, useContext, useMemo } from "react";

export type ConfirmationState = "request" | "accept" | "reject";

interface ConfirmationContextValue {
  state: ConfirmationState;
}

const ConfirmationContext = createContext<ConfirmationContextValue | null>(null);

export const useConfirmation = () => {
  const context = useContext(ConfirmationContext);
  if (!context) {
    throw new Error("Confirmation components must be used within Confirmation");
  }
  return context;
};

export type ConfirmationProps = ComponentProps<"div"> & {
  state?: ConfirmationState;
};

export const Confirmation = memo(
  ({ className, state = "request", children, ...props }: ConfirmationProps) => {
    const contextValue = useMemo(() => ({ state }), [state]);

    return (
      <ConfirmationContext.Provider value={contextValue}>
        <div
          className={cn(
            "not-prose flex w-full flex-col gap-2.5 rounded-lg border border-editorial-hairline bg-editorial-surface-card p-3 shadow-island transition-colors",
            state === "request" && "border-editorial-accent/30 bg-editorial-surface-card",
            state === "accept" &&
              "border-editorial-semantic-success/30 bg-editorial-semantic-success/5",
            state === "reject" &&
              "border-editorial-semantic-error/30 bg-editorial-semantic-error/5",
            className,
          )}
          {...props}
        >
          {children}
        </div>
      </ConfirmationContext.Provider>
    );
  },
);

Confirmation.displayName = "Confirmation";

export type ConfirmationTitleProps = ComponentProps<"div"> & {
  icon?: ReactNode;
};

export const ConfirmationTitle = memo(
  ({ className, icon, children, ...props }: ConfirmationTitleProps) => {
    const { state } = useConfirmation();

    return (
      <div
        className={cn(
          "flex items-center gap-2 text-xs font-semibold text-editorial-ink",
          className,
        )}
        {...props}
      >
        <div className="flex shrink-0 items-center justify-center">
          {icon ??
            (state === "request" ? (
              <HelpCircle className="size-4 text-editorial-accent" />
            ) : state === "accept" ? (
              <CheckCircle2 className="size-4 text-editorial-semantic-success" />
            ) : (
              <XCircle className="size-4 text-editorial-semantic-error" />
            ))}
        </div>
        <div className="min-w-0 flex-1 leading-snug">{children}</div>
      </div>
    );
  },
);

ConfirmationTitle.displayName = "ConfirmationTitle";

export type ConfirmationDescriptionProps = ComponentProps<"p">;

export const ConfirmationDescription = memo(
  ({ className, children, ...props }: ConfirmationDescriptionProps) => {
    return (
      <p
        className={cn("text-xs leading-relaxed text-editorial-ink-soft pl-6", className)}
        {...props}
      >
        {children}
      </p>
    );
  },
);

ConfirmationDescription.displayName = "ConfirmationDescription";

export type ConfirmationActionsProps = ComponentProps<"div">;

export const ConfirmationActions = memo(
  ({ className, children, ...props }: ConfirmationActionsProps) => {
    return (
      <div className={cn("flex flex-wrap items-center gap-2 pl-6 pt-1", className)} {...props}>
        {children}
      </div>
    );
  },
);

ConfirmationActions.displayName = "ConfirmationActions";

export type ConfirmationActionProps = ComponentProps<typeof Button>;

export const ConfirmationAction = memo(
  ({
    className,
    variant = "default",
    size = "sm",
    children,
    ...props
  }: ConfirmationActionProps) => {
    return (
      <Button
        variant={variant}
        size={size}
        className={cn("h-7 gap-1.5 px-3 text-xs font-medium", className)}
        {...props}
      >
        {children}
      </Button>
    );
  },
);

ConfirmationAction.displayName = "ConfirmationAction";

export type ConfirmationCancelProps = ComponentProps<typeof Button>;

export const ConfirmationCancel = memo(
  ({
    className,
    variant = "outline",
    size = "sm",
    children,
    ...props
  }: ConfirmationCancelProps) => {
    return (
      <Button
        variant={variant}
        size={size}
        className={cn(
          "h-7 gap-1.5 px-3 text-xs text-editorial-ink-muted hover:text-editorial-ink",
          className,
        )}
        {...props}
      >
        {children}
      </Button>
    );
  },
);

ConfirmationCancel.displayName = "ConfirmationCancel";
