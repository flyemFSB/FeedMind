"use client";

import {
  ThreadListItemMorePrimitive,
  ThreadListItemPrimitive,
  ThreadListPrimitive,
  useAuiState,
} from "@assistant-ui/react";
import { MessageSquare, MoreHorizontal, Pencil, Pin, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { writeActiveFeedMindThreadId } from "@/lib/api/chat-sessions";

const menuItemClass =
  "flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 outline-none hover:bg-[#f5f5f7] data-[highlighted]:bg-[#f5f5f7]";

function AssistantThreadListItem() {
  const externalId = useAuiState((state) => state.threadListItem.externalId);

  return (
    <ThreadListItemPrimitive.Root className="group grid grid-cols-[minmax(0,1fr)_32px] items-center rounded-lg">
      <ThreadListItemPrimitive.Trigger asChild>
        <Button
          variant="ghost"
          className="flex min-w-0 justify-start gap-2.5 rounded-lg px-3 py-2 pr-1 text-left text-[13px] text-[#1d1d1f] hover:bg-[#f5f5f7] data-[active]:bg-[#f5f5f7]"
          onClick={() => {
            if (externalId) writeActiveFeedMindThreadId(externalId);
          }}
        >
          <MessageSquare size={14} strokeWidth={1.5} className="shrink-0 text-[#86868b]" />
          <span className="min-w-0 flex-1 truncate">
            <ThreadListItemPrimitive.Title fallback="新会话" />
          </span>
        </Button>
      </ThreadListItemPrimitive.Trigger>

      <ThreadListItemMorePrimitive.Root modal={false}>
        <ThreadListItemMorePrimitive.Trigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="h-7 w-7 rounded-md text-[#86868b] opacity-0 transition-colors hover:bg-[#f5f5f7] hover:text-[#1d1d1f] focus:opacity-100 data-[state=open]:opacity-100 group-hover:opacity-100"
            title="更多操作"
          >
            <MoreHorizontal size={14} strokeWidth={1.8} />
          </Button>
        </ThreadListItemMorePrimitive.Trigger>
        <ThreadListItemMorePrimitive.Content
          align="end"
          side="bottom"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 min-w-[140px] rounded-xl border border-[#d2d2d7] bg-white p-1 text-[13px] text-[#1d1d1f] shadow-lg outline-none"
        >
          <ThreadListItemMorePrimitive.Item className={menuItemClass}>
            <Pin size={14} strokeWidth={1.6} />
            <span>置顶</span>
          </ThreadListItemMorePrimitive.Item>
          <ThreadListItemMorePrimitive.Item className={menuItemClass}>
            <Pencil size={14} strokeWidth={1.6} />
            <span>重命名</span>
          </ThreadListItemMorePrimitive.Item>
          <ThreadListItemMorePrimitive.Separator className="my-1 h-px bg-[#e8e8ed]" />
          <ThreadListItemPrimitive.Delete asChild>
            <ThreadListItemMorePrimitive.Item className={`${menuItemClass} text-red-500 hover:bg-red-50 data-[highlighted]:bg-red-50`}>
              <Trash2 size={14} strokeWidth={1.6} />
              <span>删除</span>
            </ThreadListItemMorePrimitive.Item>
          </ThreadListItemPrimitive.Delete>
        </ThreadListItemMorePrimitive.Content>
      </ThreadListItemMorePrimitive.Root>
    </ThreadListItemPrimitive.Root>
  );
}

export function AssistantThreadList() {
  return (
    <ThreadListPrimitive.Root>
      <div className="space-y-0.5">
        <ThreadListPrimitive.Items>
          {() => <AssistantThreadListItem />}
        </ThreadListPrimitive.Items>
      </div>
    </ThreadListPrimitive.Root>
  );
}
