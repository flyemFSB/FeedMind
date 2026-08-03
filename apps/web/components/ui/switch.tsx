"use client";

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { motion } from "motion/react";

import { cn } from "@/lib/utils";
import { motionSpring, motionTransition } from "@/lib/motion";

function Switch({
  className,
  size = "default",
  ...props
}: SwitchPrimitive.Root.Props & {
  size?: "sm" | "default";
}) {
  return (
    <SwitchPrimitive.Root
      render={(elementProps, state) => (
        <motion.span
          {...elementProps}
          animate={{
            backgroundColor: state.checked ? "var(--primary)" : "var(--input)",
          }}
          transition={motionTransition}
        />
      )}
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch relative inline-flex shrink-0 items-center rounded-full border border-transparent bg-input outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-[size=default]:h-[18.4px] data-[size=default]:w-[32px] data-[size=sm]:h-[14px] data-[size=sm]:w-[24px] dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        render={(elementProps, state) => (
          <motion.span
            {...elementProps}
            animate={{ x: state.checked ? "calc(100% - 2px)" : 0 }}
            transition={motionSpring}
          />
        )}
        data-slot="switch-thumb"
        className="pointer-events-none block rounded-full bg-background ring-0 group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3 dark:bg-primary-foreground"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
