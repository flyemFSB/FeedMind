import { useEffect, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { AppShellProvider, useAppShell } from "./app-shell-context";
import { WikiSidebar } from "./wiki-sidebar";
import { AgentDrawer } from "../agent-drawer/agent-drawer";
import { RemoteConnectionModal } from "@/app/remote-connection/remote-connection-modal";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AppShellProvider>
      <ShellLayout>{children}</ShellLayout>
    </AppShellProvider>
  );
}

function ShellLayout({ children }: { children: ReactNode }) {
  const {
    agentDrawerOpen,
    openAgentDrawer,
    closeAgentDrawer,
    remoteOpen,
    openRemote,
    closeRemote,
  } = useAppShell();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  useEffect(() => {
    if (pathname === "/chat") {
      openAgentDrawer();
      void navigate({ to: "/wiki", replace: true });
    }
  }, [pathname, openAgentDrawer, navigate]);

  return (
    <div className="relative flex h-dvh w-full overflow-hidden bg-editorial-canvas-soft">
      <WikiSidebar onRemoteClick={openRemote} />
      <div
        data-island="workspace"
        className="relative my-2 ml-0 mr-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-editorial-hairline bg-editorial-surface-soft shadow-[0_1px_3px_rgba(55,53,45,0.06)]"
      >
        {children}
      </div>
      <AgentDrawer
        open={agentDrawerOpen}
        onOpenChange={(v) => {
          if (!v) closeAgentDrawer();
        }}
      />
      <RemoteConnectionModal open={remoteOpen} onClose={closeRemote} />
    </div>
  );
}
