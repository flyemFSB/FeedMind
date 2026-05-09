"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Database, MoreHorizontal, Plus } from "lucide-react";
import { ThreadListPrimitive } from "@assistant-ui/react";
import { AssistantThreadList } from "@/components/assistant-ui/thread-list";

interface SidebarProps {
  onSettingsClick: () => void;
}

export function Sidebar({ onSettingsClick }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const secondaryNavItems = [
    { href: "/knowledge", label: "知识库", icon: Database },
  ];

  return (
    <aside className="w-[260px] min-w-[260px] h-full bg-white border-r border-[#d2d2d7] flex flex-col">
      <div className="px-5 pt-5 pb-4">
        <Link href="/chat" className="flex items-center gap-2.5">
          <Image
            src="/FeedMind-logo-text.png"
            alt="FeedMind"
            width={140}
            height={40}
            priority
            className="h-9 w-auto"
            style={{ width: "auto" }}
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
        <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-[#f5f5f7] transition-colors cursor-pointer" onClick={onSettingsClick}>
          <div className="w-8 h-8 rounded-full bg-[#0071e3] flex items-center justify-center text-white text-[13px] font-semibold">
            Z
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-[#1d1d1f] truncate">Zack</p>
            <p className="text-[11px] text-[#86868b] truncate">zack@example.com</p>
          </div>
          <MoreHorizontal size={14} className="text-[#86868b]" />
        </div>
      </div>
    </aside>
  );
}
