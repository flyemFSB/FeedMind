import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export interface WorkspaceContext {
  type: "wiki" | "feed";
  spaceId?: string | undefined;
  pageId?: string | undefined;
  pageTitle?: string | undefined;
  feedId?: string | undefined;
  feedTitle?: string | undefined;
  feedUrl?: string | undefined;
  snippet?: string | undefined;
}

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
  /** 全局命令面板是否展开 */
  commandPaletteOpen: boolean;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  toggleCommandPalette: () => void;
  /** 当前活跃工作区上下文（给 Agent 提供即时感知） */
  workspaceContext: WorkspaceContext | null;
  setWorkspaceContext: (ctx: WorkspaceContext | null) => void;
}

let _currentWorkspaceContext: WorkspaceContext | null = null;
export function getCurrentWorkspaceContext(): WorkspaceContext | null {
  return _currentWorkspaceContext;
}

const AppShellContext = createContext<AppShellContextValue | null>(null);

/**
 * AppShellProvider — 全局 UI 壳层状态
 * 管理 Agent 抽屉、远程连接弹窗、全局命令面板及活跃上下文。
 */
export function AppShellProvider({ children }: { children: ReactNode }) {
  const [agentDrawerOpen, setAgentDrawerOpen] = useState(false);
  const [remoteOpen, setRemoteOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [workspaceContext, setWorkspaceContextState] = useState<WorkspaceContext | null>(null);

  const setWorkspaceContext = useCallback((ctx: WorkspaceContext | null) => {
    _currentWorkspaceContext = ctx;
    setWorkspaceContextState(ctx);
  }, []);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1025px)");
    // 仅在小屏自动收起；桌面端默认收起、不随视口强制打开，由用户手动展开
    const syncDrawerWithViewport = () => {
      if (!desktop.matches) setAgentDrawerOpen(false);
    };
    desktop.addEventListener("change", syncDrawerWithViewport);
    return () => desktop.removeEventListener("change", syncDrawerWithViewport);
  }, []);

  // 全局快捷键监听：Cmd+K / Ctrl+K 指挥台，Cmd+\ / Ctrl+\ Agent 对话
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        setAgentDrawerOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const openAgentDrawer = useCallback(() => setAgentDrawerOpen(true), []);
  const closeAgentDrawer = useCallback(() => setAgentDrawerOpen(false), []);
  const toggleAgentDrawer = useCallback(() => setAgentDrawerOpen((v) => !v), []);

  const openRemote = useCallback(() => setRemoteOpen(true), []);
  const closeRemote = useCallback(() => setRemoteOpen(false), []);

  const openCommandPalette = useCallback(() => setCommandPaletteOpen(true), []);
  const closeCommandPalette = useCallback(() => setCommandPaletteOpen(false), []);
  const toggleCommandPalette = useCallback(() => setCommandPaletteOpen((v) => !v), []);

  const value = useMemo<AppShellContextValue>(
    () => ({
      agentDrawerOpen,
      openAgentDrawer,
      closeAgentDrawer,
      toggleAgentDrawer,
      remoteOpen,
      openRemote,
      closeRemote,
      commandPaletteOpen,
      openCommandPalette,
      closeCommandPalette,
      toggleCommandPalette,
      workspaceContext,
      setWorkspaceContext,
    }),
    [
      agentDrawerOpen,
      openAgentDrawer,
      closeAgentDrawer,
      toggleAgentDrawer,
      remoteOpen,
      openRemote,
      closeRemote,
      commandPaletteOpen,
      openCommandPalette,
      closeCommandPalette,
      toggleCommandPalette,
      workspaceContext,
      setWorkspaceContext,
    ],
  );

  return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>;
}

export function useAppShell() {
  const ctx = useContext(AppShellContext);
  if (!ctx) throw new Error("useAppShell must be used within AppShellProvider");
  return ctx;
}
