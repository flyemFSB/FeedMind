"use client";

import { Loader2 } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

interface MotionSpinnerProps {
  className?: string;
  size?: number;
  strokeWidth?: number;
}

export function MotionSpinner({ className, size = 16, strokeWidth = 2 }: MotionSpinnerProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.span
      aria-hidden="true"
      className={cn("inline-flex shrink-0", className)}
      animate={shouldReduceMotion ? { opacity: 0.65 } : { rotate: 360 }}
      transition={
        shouldReduceMotion
          ? { duration: 0.12 }
          : { duration: 0.9, ease: "linear", repeat: Infinity }
      }
    >
      <Loader2 size={size} strokeWidth={strokeWidth} />
    </motion.span>
  );
}
