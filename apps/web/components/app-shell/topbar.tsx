"use client";

import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { motion } from "motion/react";
import { ModelSelector } from "@/components/settings/model-selector";
import { useAppShell } from "@/components/app-shell/app-shell-context";
import { cn } from "@/lib/utils";

interface TopbarProps {
  title: React.ReactNode;
  subtitle?: string;
  showModelSelector?: boolean;
  rightContent?: React.ReactNode;
}

export function Topbar({ title, subtitle, showModelSelector = false, rightContent }: TopbarProps) {
  const { toggleAgentDrawer, agentDrawerOpen } = useAppShell();

  return (
    <header
      data-island="toolbar"
      className="flex h-12 shrink-0 items-center justify-between gap-2 bg-editorial-canvas-soft px-2 max-sm:px-1"
    >
      <div className="min-w-0 flex items-center gap-2">
        <h1 className="truncate text-[14px] font-semibold text-editorial-ink">{title}</h1>
        {subtitle && <p className="text-[12px] text-editorial-ink-muted truncate">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-1.5">
        {rightContent}
        {showModelSelector && (
          <div className="hidden md:block">
            <ModelSelector />
          </div>
        )}
        <AgentToggleButton active={agentDrawerOpen} onClick={toggleAgentDrawer} />
      </div>
    </header>
  );
}

function AgentToggleButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label="Agent 对话"
      data-testid="agent-toggle"
      aria-pressed={active}
      title="Agent 对话"
      animate={{ scale: active ? 1.04 : 1 }}
      whileHover={{ scale: active ? 1.07 : 1.04 }}
      whileTap={{ scale: 0.92 }}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-md",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent",
        active
          ? "bg-editorial-accent-soft text-editorial-accent"
          : "text-editorial-ink-soft hover:bg-editorial-surface-soft hover:text-editorial-ink",
      )}
    >
      {active ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
    </motion.button>
  );
}
