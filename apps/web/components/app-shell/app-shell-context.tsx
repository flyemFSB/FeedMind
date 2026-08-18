"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface AppShellContextValue {
  /** Agent 对话抽屉是否展开 */
  agentDrawerOpen: boolean;
  /** 打开 Agent 抽屉 */
  openAgentDrawer: () => void;
  /** 关闭 Agent 抽屉 */
  closeAgentDrawer: () => void;
  /** 切换 Agent 抽屉 */
  toggleAgentDrawer: () => void;
  /** 远程连接弹窗是否展开 */
  remoteOpen: boolean;
  /** 打开远程连接 */
  openRemote: () => void;
  /** 关闭远程连接 */
  closeRemote: () => void;
}

const AppShellContext = createContext<AppShellContextValue | null>(null);

/**
 * AppShellProvider — 全局 UI 壳层状态
 * 管理 Agent 抽屉与远程连接弹窗的开关，供左侧导航栏与各页面顶栏共享。
 */
export function AppShellProvider({ children }: { children: ReactNode }) {
  const [agentDrawerOpen, setAgentDrawerOpen] = useState(false);
  const [remoteOpen, setRemoteOpen] = useState(false);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1025px)");
    // 仅在小屏自动收起；桌面端默认收起、不随视口强制打开，由用户手动展开
    const syncDrawerWithViewport = () => {
      if (!desktop.matches) setAgentDrawerOpen(false);
    };
    desktop.addEventListener("change", syncDrawerWithViewport);
    return () => desktop.removeEventListener("change", syncDrawerWithViewport);
  }, []);

  const openAgentDrawer = useCallback(() => setAgentDrawerOpen(true), []);
  const closeAgentDrawer = useCallback(() => setAgentDrawerOpen(false), []);
  const toggleAgentDrawer = useCallback(() => setAgentDrawerOpen((v) => !v), []);

  const openRemote = useCallback(() => setRemoteOpen(true), []);
  const closeRemote = useCallback(() => setRemoteOpen(false), []);

  const value = useMemo<AppShellContextValue>(
    () => ({
      agentDrawerOpen,
      openAgentDrawer,
      closeAgentDrawer,
      toggleAgentDrawer,
      remoteOpen,
      openRemote,
      closeRemote,
    }),
    [
      agentDrawerOpen,
      openAgentDrawer,
      closeAgentDrawer,
      toggleAgentDrawer,
      remoteOpen,
      openRemote,
      closeRemote,
    ],
  );

  return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>;
}

export function useAppShell() {
  const ctx = useContext(AppShellContext);
  if (!ctx) throw new Error("useAppShell must be used within AppShellProvider");
  return ctx;
}
