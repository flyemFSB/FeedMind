import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

type Theme = "dark" | "light" | "system";
type ResolvedTheme = "dark" | "light";

type ThemeProviderProps = {
  children: ReactNode;
  defaultTheme?: Theme;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

/** 主进程下发的原生主题事件（见 apps/desktop 的 pushSystemTheme） */
const SYSTEM_THEME_EVENT = "feedmind:system-theme";

declare global {
  interface Window {
    __feedmindSystemTheme?: ResolvedTheme;
  }
}

/** 主进程下发的原生主题优先：CDP 自动化与 DevTools 模拟会伪造媒体查询，只信它会把界面锚成浅色 */
export function resolveSystemTheme(
  pushedTheme: ResolvedTheme | undefined,
  mediaDark: boolean,
): ResolvedTheme {
  return pushedTheme ?? (mediaDark ? "dark" : "light");
}

const ThemeProviderContext = createContext<ThemeProviderState | undefined>(undefined);

/**
 * ThemeProvider — 零依赖的白天/黑夜/系统主题切换（shadcn/ui 官方 Vite 方案）
 * - 通过 <html> 的 .dark/.light 类控制 Tailwind CSS v4 暗色模式
 * - 切换时临时禁用 CSS 过渡，避免闪烁
 * - 持久化到 localStorage，刷新后保持
 * - 跟随系统：桌面端以主进程 nativeTheme 下发的值为准，媒体查询仅作浏览器环境兜底
 */
export function ThemeProvider({ children, defaultTheme = "system" }: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem("feedmind-theme") as Theme) || defaultTheme,
  );

  useEffect(() => {
    const root = window.document.documentElement;

    root.style.setProperty("transition", "none");
    root.classList.remove("light", "dark");

    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const applySystemTheme = () => {
        root.classList.remove("light", "dark");
        root.classList.add(resolveSystemTheme(window.__feedmindSystemTheme, mediaQuery.matches));
      };
      applySystemTheme();
      mediaQuery.addEventListener("change", applySystemTheme);
      window.addEventListener(SYSTEM_THEME_EVENT, applySystemTheme);
      requestAnimationFrame(() => root.style.removeProperty("transition"));
      return () => {
        mediaQuery.removeEventListener("change", applySystemTheme);
        window.removeEventListener(SYSTEM_THEME_EVENT, applySystemTheme);
      };
    }

    root.classList.add(theme);
    requestAnimationFrame(() => root.style.removeProperty("transition"));
    return;
  }, [theme]);

  // useMemo 稳定 Context Value：对象字面量每次渲染均会新建引用，会导致所有消费组件的 React.memo 缓存失效
  const value = useMemo<ThemeProviderState>(
    () => ({
      theme,
      setTheme: (newTheme: Theme) => {
        localStorage.setItem("feedmind-theme", newTheme);
        setTheme(newTheme);
      },
    }),
    [theme],
  );

  return <ThemeProviderContext.Provider value={value}>{children}</ThemeProviderContext.Provider>;
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);
  if (!context) throw new Error("useTheme must be used within a ThemeProvider");
  return context;
};
