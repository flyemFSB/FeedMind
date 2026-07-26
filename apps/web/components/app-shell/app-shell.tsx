"use client";

import { useEffect, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { AppShellProvider, useAppShell } from "./app-shell-context";
import { WikiSidebar } from "./wiki-sidebar";
import { AgentDrawer } from "./agent-drawer";
import { SettingsModal } from "@/components/settings/settings-modal";
import { RemoteConnectionModal } from "@/components/remote-connection/remote-connection-modal";

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
    remoteOpen,
    openRemote,
    closeRemote,
  } = useAppShell();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  useEffect(() => {
    if (pathname === "/chat") {
      openAgentDrawer();
      navigate({ to: "/wiki", replace: true });
    }
  }, [pathname, openAgentDrawer, navigate]);

  return (
    <div className="relative flex h-dvh w-full overflow-hidden bg-editorial-canvas-soft">
      <WikiSidebar onSettingsClick={openSettings} onRemoteClick={openRemote} />
      <div
        data-island="workspace"
        className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-editorial-canvas-soft shadow-[-1px_0_2px_rgba(0,0,0,0.04)]"
      >
        {children}
      </div>
      <AgentDrawer
        open={agentDrawerOpen}
        onOpenChange={(v) => {
          if (!v) closeAgentDrawer();
        }}
      />
      <SettingsModal open={settingsOpen} onClose={closeSettings} />
      <RemoteConnectionModal open={remoteOpen} onClose={closeRemote} />
    </div>
  );
}
