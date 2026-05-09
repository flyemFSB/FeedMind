"use client";

import { ModelSelector } from "@/components/settings/model-selector";

interface TopbarProps {
  title: string;
  subtitle?: string;
}

export function Topbar({ title, subtitle }: TopbarProps) {
  return (
    <header className="h-14 flex items-center justify-between gap-4 px-6 border-b border-[#d2d2d7] bg-white shrink-0">
      <div className="min-w-0">
        <h1 className="text-[17px] font-semibold text-[#1d1d1f] tracking-[-0.2px]">
          {title}
        </h1>
        {subtitle && (
          <p className="text-[12px] text-[#86868b] truncate">{subtitle}</p>
        )}
      </div>
      <ModelSelector />
    </header>
  );
}
