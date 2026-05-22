"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Database, MoreHorizontal, Plus, Settings, LogOut } from "lucide-react";
import { ThreadListPrimitive } from "@assistant-ui/react";
import { AssistantThreadList } from "@/components/assistant-ui/thread-list";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface SidebarProps {
  onSettingsClick: () => void;
}

export function Sidebar({ onSettingsClick }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const secondaryNavItems = [
    { href: "/wiki", label: "我的 WIKI", icon: Database },
  ];

  return (
    <aside className="flex h-full w-[260px] min-w-[260px] flex-col border-r border-[#d2d2d7] bg-white max-md:hidden">
      <div className="px-5 pt-5 pb-4">
        <Link href="/chat" className="flex items-center gap-2.5">
          <Image
            src="/FeedMind-logo-text.png"
            alt="FeedMind"
            width={139}
            height={36}
            priority
            style={{ height: "auto" }}
          />
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
          <span>新会话</span>
        </ThreadListPrimitive.New>
      </nav>

      <nav className="px-3 pb-4">
        {secondaryNavItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[14px] font-medium transition-colors ${
              pathname === item.href
                ? "bg-[#f5f5f7] text-[#1d1d1f]"
                : "text-[#1d1d1f] hover:bg-[#f5f5f7]"
            }`}
          >
            <item.icon size={16} strokeWidth={2} />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      <div className="flex-1 overflow-y-auto px-3">
        <div className="px-3 pb-2 pt-1">
          <span className="text-[11px] font-medium text-[#86868b] uppercase tracking-wide">
            最近会话
          </span>
        </div>
        <AssistantThreadList />
      </div>

      <div className="p-3 border-t border-[#d2d2d7]">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-[#f5f5f7]">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0071e3] text-[13px] font-semibold text-white">
              Z
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-[#1d1d1f]">Zack</p>
              <p className="truncate text-[11px] text-[#86868b]">zack@example.com</p>
            </div>
            <MoreHorizontal size={14} className="text-[#86868b]" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-48">
            <DropdownMenuItem onClick={onSettingsClick}>
              <Settings size={14} />
              <span>设置</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive">
              <LogOut size={14} />
              <span>退出登录</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
