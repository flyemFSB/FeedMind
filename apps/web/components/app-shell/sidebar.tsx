"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, ChevronLeft, ChevronRight, Plus, Settings } from "lucide-react";
import { ThreadListPrimitive } from "@assistant-ui/react";
import { AssistantThreadList } from "@/components/assistant-ui/thread-list";

interface SidebarProps {
  onSettingsClick: () => void;
  mobile?: boolean;
}

export function Sidebar({ onSettingsClick, mobile = false }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("sidebar-collapsed");
    if (stored === "true") setCollapsed(true);
  }, []);

  useEffect(() => {
    localStorage.setItem("sidebar-collapsed", String(collapsed));
  }, [collapsed]);
  const asideClassName = `flex h-full flex-col border-r border-[#d2d2d7] bg-white transition-all duration-200 ${
    collapsed ? "w-[60px] min-w-[60px]" : "w-[260px] min-w-[260px]"
  } ${mobile ? "" : "max-md:hidden"}`;

  return (
    <aside className={asideClassName}>
      <div className="px-5 pt-5 pb-4">
        <Link href="/chat" className="flex items-center gap-2.5">
          {collapsed ? (
            <Image
              src="/FeedMind-logo.png"
              alt="FeedMind"
              width={28}
              height={28}
              priority
            />
          ) : (
            <Image
              src="/FeedMind-logo-text.png"
              alt="FeedMind"
              width={139}
              height={36}
              priority
              style={{ height: "auto" }}
            />
          )}
        </Link>
      </div>

      <nav className="px-3 pb-2">
        <ThreadListPrimitive.New
          className="flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#0071e3] px-3 text-[14px] font-semibold text-white shadow-sm shadow-[#0071e3]/20 transition-all hover:bg-[#0066cc] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3]/30 active:translate-y-px data-[active]:bg-[#0066cc]"
          onClick={() => {
            if (pathname !== "/chat") router.push("/chat");
          }}
        >
          <Plus size={16} strokeWidth={2} />
          {!collapsed && <span>新会话</span>}
        </ThreadListPrimitive.New>
      </nav>

      <div className="px-3 pb-1">
        <Link
          href="/wiki"
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[14px] font-medium transition-colors hover:bg-[#f5f5f7] ${
            collapsed ? "justify-center" : ""
          } ${
            pathname === "/wiki"
              ? "text-[#0071e3] bg-[#0071e3]/5"
              : "text-[#1d1d1f]"
          }`}
        >
          <BookOpen size={16} strokeWidth={1.5} />
          {!collapsed && <span>我的WIKI</span>}
        </Link>
      </div>

      {!collapsed ? (
        <div className="flex-1 overflow-y-auto px-3">
          <div className="px-3 pb-2 pt-1">
            <span className="text-[11px] font-medium text-[#86868b] uppercase tracking-wide">
              最近会话
            </span>
          </div>
          <AssistantThreadList />
        </div>
      ) : (
        <div className="flex-1" />
      )}

      <div className="flex items-center p-3 border-t border-[#d2d2d7]">
        <button
          onClick={onSettingsClick}
          className="flex items-center gap-3 rounded-lg px-2 py-2 text-[14px] font-medium text-[#1d1d1f] transition-colors hover:bg-[#f5f5f7] flex-1"
        >
          <Settings size={16} strokeWidth={1.5} />
          {!collapsed && <span>配置中心</span>}
        </button>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[#86868b] transition-colors hover:bg-[#f5f5f7]"
          title={collapsed ? "展开侧边栏" : "收起侧边栏"}
        >
          {collapsed ? (
            <ChevronRight size={16} strokeWidth={1.5} />
          ) : (
            <ChevronLeft size={16} strokeWidth={1.5} />
          )}
        </button>
      </div>
    </aside>
  );
}
