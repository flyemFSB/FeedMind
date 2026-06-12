"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

/**
 * ThemeProvider — 使用 next-themes 提供白天/黑夜/系统主题切换
 * - attribute="class": Tailwind CSS v4 暗色模式通过 .dark 类控制
 * - defaultTheme="system": 默认跟随系统
 * - enableSystem: 允许 system 主题选项
 * - disableTransitionOnChange: 切换主题时禁用 CSS 过渡，避免闪烁
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
