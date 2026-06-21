"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

interface AppShellContextValue {
  /** Agent 对话抽屉是否展开 */
  agentDrawerOpen: boolean;
  /** 打开 Agent 抽屉 */
  openAgentDrawer: () => void;
  /** 关闭 Agent 抽屉 */
  closeAgentDrawer: () => void;
  /** 切换 Agent 抽屉 */
  toggleAgentDrawer: () => void;
  /** 设置弹窗是否展开 */
  settingsOpen: boolean;
  /** 打开设置 */
  openSettings: () => void;
  /** 关闭设置 */
  closeSettings: () => void;
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
 * 管理 Agent 抽屉与设置弹窗的开关，供左侧导航栏与各页面顶栏共享。
 */
export function AppShellProvider({ children }: { children: ReactNode }) {
  const [agentDrawerOpen, setAgentDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [remoteOpen, setRemoteOpen] = useState(false);

  const openAgentDrawer = useCallback(() => setAgentDrawerOpen(true), []);
  const closeAgentDrawer = useCallback(() => setAgentDrawerOpen(false), []);
  const toggleAgentDrawer = useCallback(() => setAgentDrawerOpen((v) => !v), []);

  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  const openRemote = useCallback(() => setRemoteOpen(true), []);
  const closeRemote = useCallback(() => setRemoteOpen(false), []);

  const value = useMemo<AppShellContextValue>(
    () => ({
      agentDrawerOpen,
      openAgentDrawer,
      closeAgentDrawer,
      toggleAgentDrawer,
      settingsOpen,
      openSettings,
      closeSettings,
      remoteOpen,
      openRemote,
      closeRemote,
    }),
    [
      agentDrawerOpen,
      openAgentDrawer,
      closeAgentDrawer,
      toggleAgentDrawer,
      settingsOpen,
      openSettings,
      closeSettings,
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
