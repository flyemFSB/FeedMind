"use client";

import { MessageCircle, PanelRightClose } from "lucide-react";
import { motion } from "motion/react";
import { ModelSelector } from "@/components/settings/model-selector";
import { useAppShell } from "@/components/app-shell/app-shell-context";
import { useTranslation } from "react-i18next";
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
      className="flex h-12 shrink-0 items-center justify-between gap-2 px-2 max-sm:px-1"
    >
      <div className="min-w-0 flex items-center gap-2">
        <h1 className="truncate text-sm font-semibold text-editorial-ink">{title}</h1>
        {subtitle && <p className="text-xs text-editorial-ink-muted truncate">{subtitle}</p>}
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
  const { t } = useTranslation();
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label={t("common.askAI")}
      data-testid="agent-toggle"
      aria-pressed={active}
      title={t("common.askAI")}
      animate={{ scale: active ? 1.04 : 1 }}
      whileHover={{ scale: active ? 1.07 : 1.04 }}
      whileTap={{ scale: 0.92 }}
      className={cn(
        "flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2.5",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent",
        active
          ? "bg-editorial-accent-soft text-editorial-accent"
          : "text-editorial-ink-soft hover:bg-editorial-surface-soft hover:text-editorial-ink",
      )}
    >
      {active ? <PanelRightClose size={15} /> : <MessageCircle size={15} />}
      <span className="text-xs font-medium">{t("common.askAI")}</span>
    </motion.button>
  );
}
