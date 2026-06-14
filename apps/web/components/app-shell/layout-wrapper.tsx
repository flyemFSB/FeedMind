"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { motion } from "motion/react";
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
  title: React.ReactNode;
  subtitle?: string;
  showModelSelector?: boolean;
  topRightContent?: React.ReactNode;
}

export function LayoutWrapper({
  children,
  title,
  subtitle,
  showModelSelector = false,
  topRightContent,
}: LayoutWrapperProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar onSettingsClick={() => setSettingsOpen(true)} />

      <Sheet>
        <SheetTrigger className="fixed left-3 top-3 z-50 inline-flex items-center justify-center rounded-lg p-2 text-editorial-ink-muted hover:bg-editorial-surface-soft md:hidden">
          <Menu size={18} />
        </SheetTrigger>
        <SheetContent side="left" className="w-[260px] p-0">
          <Sidebar mobile onSettingsClick={() => setSettingsOpen(true)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col bg-editorial-surface-card">
        <Topbar
          title={title}
          subtitle={subtitle}
          showModelSelector={showModelSelector}
          rightContent={topRightContent}
        />

        <div className="flex min-h-0 flex-1">
          <motion.main
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="min-w-0 flex-1 overflow-y-auto h-full"
          >
            {children}
          </motion.main>
        </div>
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
