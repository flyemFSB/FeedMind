"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { SettingsModal } from "@/components/settings/settings-modal";

interface LayoutWrapperProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  showPreview?: boolean;
  previewPanel?: React.ReactNode;
}

export function LayoutWrapper({
  children,
  title,
  subtitle,
  showPreview = false,
  previewPanel,
}: LayoutWrapperProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="flex h-screen w-full bg-white overflow-hidden">
      <Sidebar onSettingsClick={() => setSettingsOpen(true)} />

      <div className="flex-1 flex flex-col min-w-0">
        <Topbar
          title={title}
          subtitle={subtitle}
        />

        <div className="flex-1 flex min-h-0">
          <main className="flex-1 min-w-0 overflow-y-auto">
            {children}
          </main>

          {showPreview && previewPanel && (
            <aside className="w-[380px] min-w-[380px] border-l border-[#d2d2d7] bg-white overflow-y-auto">
              {previewPanel}
            </aside>
          )}
        </div>
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
