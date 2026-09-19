import { cn } from "@/lib/utils";
import { m } from "motion/react";
import type { ComponentProps, ReactNode } from "react";
import { memo } from "react";

export type SuggestionsProps = ComponentProps<"div"> & {
  layout?: "scroll" | "wrap";
};

// 建议词容器：支持横向滚动或换行排列
export const Suggestions = memo(
  ({ className, layout = "scroll", children, ...props }: SuggestionsProps) => (
    <div
      className={cn(
        layout === "wrap"
          ? "flex w-full flex-wrap items-center gap-2"
          : "flex w-full items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  ),
);

Suggestions.displayName = "Suggestions";

export type SuggestionProps = Omit<ComponentProps<typeof m.button>, "children"> & {
  children: ReactNode;
  icon?: ReactNode;
};

export const Suggestion = memo(({ className, children, icon, ...props }: SuggestionProps) => (
  <m.button
    type="button"
    whileHover={{ scale: 1.015, y: -0.5 }}
    whileTap={{ scale: 0.98 }}
    className={cn(
      "group inline-flex cursor-pointer items-center gap-2 rounded-full border border-editorial-hairline bg-editorial-surface-soft/60 px-4 py-2 text-xs text-editorial-ink-soft shadow-2xs transition-all duration-150",
      "hover:border-editorial-hairline-strong hover:bg-editorial-surface-card hover:text-editorial-ink hover:shadow-xs",
      "focus-visible:outline-none focus-visible:ring-1.5 focus-visible:ring-editorial-accent",
      className,
    )}
    {...props}
  >
    {icon && (
      <span className="shrink-0 text-editorial-ink-muted transition-colors group-hover:text-editorial-ink">
        {icon}
      </span>
    )}
    <span className="truncate font-normal tracking-wide">{children}</span>
  </m.button>
));

Suggestion.displayName = "Suggestion";
