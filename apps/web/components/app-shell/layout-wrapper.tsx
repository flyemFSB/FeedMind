"use client";

import type { ReactNode } from "react";
import { Topbar } from "./topbar";

interface LayoutWrapperProps {
  children: ReactNode;
  title: ReactNode;
  subtitle?: string;
  showModelSelector?: boolean;
  topRightContent?: ReactNode;
}

export function LayoutWrapper({
  children,
  title,
  subtitle,
  showModelSelector = false,
  topRightContent,
}: LayoutWrapperProps) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-editorial-canvas-soft">
      <Topbar
        title={title}
        subtitle={subtitle}
        showModelSelector={showModelSelector}
        rightContent={topRightContent}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden px-1 pb-1 max-sm:px-0.5 max-sm:pb-0.5">
        <main className="h-full min-h-0 min-w-0 flex-1 overflow-y-auto rounded-xl border border-editorial-hairline bg-editorial-surface-card max-sm:rounded-lg">
          {children}
        </main>
      </div>
    </div>
  );
}
