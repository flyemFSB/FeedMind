"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { SettingsModal } from "@/components/settings/settings-modal";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";

interface LayoutWrapperProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  showModelSelector?: boolean;
}

export function LayoutWrapper({
  children,
  title,
  subtitle,
  showModelSelector = false,
}: LayoutWrapperProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-white">
      <Sidebar onSettingsClick={() => setSettingsOpen(true)} />

      <Sheet>
        <SheetTrigger className="fixed left-3 top-3 z-50 inline-flex items-center justify-center rounded-lg p-2 text-[#86868b] hover:bg-[#f5f5f7] md:hidden">
          <Menu size={18} />
        </SheetTrigger>
        <SheetContent side="left" className="w-[260px] p-0">
          <Sidebar mobile onSettingsClick={() => setSettingsOpen(true)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          title={title}
          subtitle={subtitle}
          showModelSelector={showModelSelector}
        />

        <div className="flex min-h-0 flex-1">
          <main className="min-w-0 flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
