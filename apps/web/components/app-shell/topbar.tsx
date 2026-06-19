"use client";

import { MessageSquare } from "lucide-react";
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

/**
 * Topbar — 页面顶栏
 * - 左侧标题 + 副标题
 * - 右侧自定义操作 + 模型选择器 + Agent 对话入口
 * - Agent 按钮使用 surface-strong 背景（非黑色），点击弹出右侧抽屉
 */
export function Topbar({ title, subtitle, showModelSelector = false, rightContent }: TopbarProps) {
  const { toggleAgentDrawer, agentDrawerOpen } = useAppShell();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-editorial-hairline bg-editorial-surface-card px-6 max-sm:px-4">
      <div className="min-w-0 flex items-center gap-3">
        <h1 className="text-[17px] font-semibold text-editorial-ink tracking-[-0.2px] truncate">
          {title}
        </h1>
        {subtitle && <p className="text-[12px] text-editorial-ink-muted truncate">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">
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
      whileTap={{ scale: 0.94 }}
      aria-label="Agent 对话"
      data-testid="agent-toggle"
      aria-pressed={active}
      title="Agent 对话"
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-full border transition-colors duration-150 ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editorial-hairline-strong",
        active
          ? "border-editorial-hairline-strong bg-editorial-surface-strong text-editorial-ink"
          : "border-editorial-hairline bg-editorial-surface-card text-editorial-ink-soft hover:bg-editorial-surface-soft hover:text-editorial-ink",
      )}
    >
      <MessageSquare size={16} strokeWidth={1.8} />
    </motion.button>
  );
}
