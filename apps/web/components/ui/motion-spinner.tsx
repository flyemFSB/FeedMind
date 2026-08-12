"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface MotionSpinnerProps {
  className?: string;
  size?: number;
  strokeWidth?: number;
}

// 纯 CSS 旋转（animate-spin）：与项目其他 spinner（ui/spinner、message-parts 等）保持一致。
// 原 motion JS 动画在系统开启"减少动画"时退化为静态圆圈，loading 反馈消失——UX 缺陷
export function MotionSpinner({ className, size = 16, strokeWidth = 2 }: MotionSpinnerProps) {
  return (
    <Loader2
      aria-hidden="true"
      className={cn("inline-block shrink-0 animate-spin", className)}
      size={size}
      strokeWidth={strokeWidth}
    />
  );
}
