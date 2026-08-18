"use client";

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { CheckIcon, MinusIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Base UI Checkbox 封装：半选态经 data-indeterminate 驱动，
 * Indicator 依据状态渲染 勾/横，样式对齐编辑面设计系统。
 */
function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "grid size-[18px] shrink-0 place-items-center rounded-[5px] border border-editorial-hairline-strong bg-editorial-surface-card",
        "transition-colors data-[checked]:border-editorial-accent data-[checked]:bg-editorial-accent",
        "data-[indeterminate]:border-editorial-accent data-[indeterminate]:bg-editorial-accent",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent focus-visible:ring-offset-1",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        render={(elementProps, state) => (
          <span {...elementProps} className="grid place-items-center text-editorial-ink-on-primary">
            {state.indeterminate ? (
              <MinusIcon size={11} strokeWidth={3} />
            ) : (
              <CheckIcon size={11} strokeWidth={3} />
            )}
          </span>
        )}
      />
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
