"use client";

import { memo } from "react";
import type { ComponentProps } from "react";
import { Streamdown } from "streamdown";
import { cjk } from "@streamdown/cjk";
import { lightweightCode as code } from "./code-plugin";
import { cn } from "@/lib/utils";
import "streamdown/styles.css";

export type MessageResponseContentProps = ComponentProps<typeof Streamdown>;

export const MessageResponseContent = memo(function MessageResponseContent({
  className,
  ...props
}: MessageResponseContentProps) {
  return (
    <Streamdown
      mode="streaming"
      animated={{
        sep: "char",
        stagger: 12,
        duration: 120,
        animation: "fadeIn",
      }}
      className={cn(className)}
      plugins={{ cjk, code }}
      shikiTheme={["github-light", "github-dark"]}
      {...props}
    />
  );
});
