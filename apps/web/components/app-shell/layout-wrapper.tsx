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
        <main className="h-full min-h-0 min-w-0 flex-1 overflow-y-auto rounded-xl border border-editorial-hairline bg-editorial-surface-card shadow-[0_1px_3px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.02)] max-sm:rounded-lg">
          {children}
        </main>
      </div>
    </div>
  );
}
