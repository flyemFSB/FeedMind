"use client";

import { memo, type ComponentProps, type ReactNode } from "react";
import { Streamdown } from "streamdown";
import { cjk } from "@streamdown/cjk";
import { lightweightCode as code } from "./code-plugin";
import { cn } from "@/lib/utils";
import "streamdown/styles.css";

export type MessageResponseContentProps = ComponentProps<typeof Streamdown>;

function TableWrapper({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) {
  return (
    <div className="w-full max-w-full overflow-x-auto">
      <table {...props}>{children}</table>
    </div>
  );
}

export const MessageResponseContent = memo(function MessageResponseContent({
  className,
  ...props
}: MessageResponseContentProps) {
  return (
    <Streamdown
      mode="streaming"
      className={cn(className)}
      plugins={{ cjk, code }}
      shikiTheme={["github-light", "github-dark"]}
      components={{
        table: TableWrapper,
      }}
      {...props}
    />
  );
});
