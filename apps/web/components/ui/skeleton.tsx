import { cn } from "@/lib/utils";
import { motion, useReducedMotion } from "motion/react";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      data-slot="skeleton"
      className={cn("rounded-md bg-editorial-hairline", className)}
      animate={shouldReduceMotion ? { opacity: 0.8 } : { opacity: [0.55, 1, 0.55] }}
      transition={shouldReduceMotion ? { duration: 0.12 } : { duration: 1.6, repeat: Infinity }}
      {...props}
    />
  );
}

export { Skeleton };
