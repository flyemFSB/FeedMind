"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { Topbar } from "./topbar";

interface LayoutWrapperProps {
  children: ReactNode;
  title: ReactNode;
  subtitle?: string;
  showModelSelector?: boolean;
  topRightContent?: ReactNode;
}

/**
 * LayoutWrapper — 页面级布局包装
 * - 顶栏（Topbar）+ 主内容区
 * - 左侧 Wiki 导航与右侧 Agent 抽屉由全局 AppShell 提供
 */
export function LayoutWrapper({
  children,
  title,
  subtitle,
  showModelSelector = false,
  topRightContent,
}: LayoutWrapperProps) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-editorial-surface-card">
      <Topbar
        title={title}
        subtitle={subtitle}
        showModelSelector={showModelSelector}
        rightContent={topRightContent}
      />

      <div className="flex min-h-0 flex-1">
        <motion.main
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="h-full min-h-0 min-w-0 flex-1 overflow-y-auto"
        >
          {children}
        </motion.main>
      </div>
    </div>
  );
}
