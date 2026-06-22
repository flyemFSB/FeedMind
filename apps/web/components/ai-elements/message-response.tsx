"use client";

import { memo, type ComponentProps, type ReactNode } from "react";
import { Streamdown } from "streamdown";
import { cjk } from "@streamdown/cjk";
import { lightweightCode as code } from "./code-plugin";
import { cn } from "@/lib/utils";
import "streamdown/styles.css";

export type MessageResponseContentProps = ComponentProps<typeof Streamdown>;

/**
 * TableWrapper — 将 Markdown 表格包裹在可横向滚动的容器中。
 *
 * 宽度不够的窄表格保持内容宽度，不拉伸；超宽的表格出现底部横向滚动条，
 * 且宽度不超过父容器。
 */
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
      animated={{
        sep: "char",
        stagger: 12,
        duration: 120,
        animation: "fadeIn",
      }}
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
