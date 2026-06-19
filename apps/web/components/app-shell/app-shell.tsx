"use client";

import { useEffect, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { AppShellProvider, useAppShell } from "./app-shell-context";
import { WikiSidebar } from "./wiki-sidebar";
import { AgentDrawer } from "./agent-drawer";
import { SettingsModal } from "@/components/settings/settings-modal";

/**
 * AppShell — 全局应用壳层
 * - 左侧 Wiki 图标导航（产品重心）
 * - 中间主内容区（各页面 Outlet）
 * - 右侧 Agent 对话抽屉（按需弹出）
 * - 设置弹窗（全局）
 *
 * Agent 对话从主视图退居为辅助工具，Wiki 成为默认工作台。
 * 访问 /chat 会自动展开 Agent 抽屉并回到 /wiki，保持旧链接可用。
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AppShellProvider>
      <ShellLayout>{children}</ShellLayout>
    </AppShellProvider>
  );
}

function ShellLayout({ children }: { children: ReactNode }) {
  const {
    openSettings,
    agentDrawerOpen,
    openAgentDrawer,
    closeAgentDrawer,
    settingsOpen,
    closeSettings,
  } = useAppShell();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  // 旧 /chat 链接：展开抽屉并回到 Wiki 工作台
  useEffect(() => {
    if (pathname === "/chat") {
      openAgentDrawer();
      navigate({ to: "/wiki", replace: true });
    }
  }, [pathname, openAgentDrawer, navigate]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-editorial-canvas">
      <WikiSidebar onSettingsClick={openSettings} />
      <div className="flex min-w-[320px] flex-1 flex-col">{children}</div>
      <AgentDrawer
        open={agentDrawerOpen}
        onOpenChange={(v) => {
          if (!v) closeAgentDrawer();
        }}
      />
      <SettingsModal open={settingsOpen} onClose={closeSettings} />
    </div>
  );
}
