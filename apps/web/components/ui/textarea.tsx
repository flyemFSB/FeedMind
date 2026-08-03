import * as React from "react";
import { motion } from "motion/react";

import { cn } from "@/lib/utils";
import { motionTransition } from "@/lib/motion";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <motion.textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-md border border-input bg-white px-2.5 py-2 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:bg-transparent dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className,
      )}
      whileFocus={{ borderColor: "var(--ring)" }}
      transition={motionTransition}
      {...props}
    />
  );
}

export { Textarea };
