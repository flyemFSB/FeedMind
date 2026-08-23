import type { ReactNode } from "react";
import { Topbar } from "./topbar";

interface LayoutWrapperProps {
  children: ReactNode;
  title?: ReactNode;
  subtitle?: string;
  showModelSelector?: boolean;
  topRightContent?: ReactNode;
  /** 为 true 时渲染共享 Topbar；为 false 时页面自行提供头部（如 wiki 并入页面内） */
  showTopbar?: boolean;
}

export function LayoutWrapper({
  children,
  title,
  subtitle,
  showModelSelector = false,
  topRightContent,
  showTopbar = true,
}: LayoutWrapperProps) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {showTopbar && (
        <Topbar
          title={title}
          showModelSelector={showModelSelector}
          rightContent={topRightContent}
          {...(subtitle !== undefined ? { subtitle } : {})}
        />
      )}

      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-editorial-surface-card">
        {children}
      </main>
    </div>
  );
}
