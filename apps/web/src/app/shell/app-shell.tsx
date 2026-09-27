import { Suspense, lazy, useEffect, useState, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { AppShellProvider, useAppShell } from "./app-shell-context";
import { WikiSidebar } from "./wiki-sidebar";
import { AgentDrawer } from "../agent-drawer/agent-drawer";

const RemoteConnectionModal = lazy(() =>
  import("@/app/remote-connection/remote-connection-modal").then((m) => ({
    default: m.RemoteConnectionModal,
  })),
);
const CommandPalette = lazy(() =>
  import("@/components/command-palette").then((m) => ({
    default: m.CommandPalette,
  })),
);

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
    commandPaletteOpen,
  } = useAppShell();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  // 首次触发时再挂载弹窗组件，避免首屏静态打包与开销
  const [hasOpenedRemote, setHasOpenedRemote] = useState(remoteOpen);
  if (remoteOpen && !hasOpenedRemote) setHasOpenedRemote(true);

  const [hasOpenedPalette, setHasOpenedPalette] = useState(commandPaletteOpen);
  if (commandPaletteOpen && !hasOpenedPalette) setHasOpenedPalette(true);

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
        className="relative my-2 ml-0 mr-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-editorial-hairline bg-editorial-surface-soft shadow-island"
      >
        {children}
      </div>
      <AgentDrawer
        open={agentDrawerOpen}
        onOpenChange={(v) => {
          if (!v) closeAgentDrawer();
        }}
      />
      {hasOpenedRemote && (
        <Suspense fallback={null}>
          <RemoteConnectionModal open={remoteOpen} onClose={closeRemote} />
        </Suspense>
      )}
      {hasOpenedPalette && (
        <Suspense fallback={null}>
          <CommandPalette />
        </Suspense>
      )}
    </div>
  );
}
