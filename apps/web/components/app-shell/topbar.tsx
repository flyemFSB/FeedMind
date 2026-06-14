"use client";

import { ModelSelector } from "@/components/settings/model-selector";

interface TopbarProps {
  title: React.ReactNode;
  subtitle?: string;
  showModelSelector?: boolean;
  rightContent?: React.ReactNode;
}

export function Topbar({ title, subtitle, showModelSelector = false, rightContent }: TopbarProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-editorial-hairline bg-editorial-surface-card px-6 max-sm:px-4">
      <div className="min-w-0 flex items-center gap-3">
        <h1 className="text-[17px] font-semibold text-editorial-ink tracking-[-0.2px]">
          {title}
        </h1>
        {subtitle && (
          <p className="text-[12px] text-editorial-ink-muted truncate">{subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {rightContent}
        {showModelSelector && <ModelSelector />}
      </div>
    </header>
  );
}
