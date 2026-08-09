"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useStickToBottomContext } from "use-stick-to-bottom";
import type { UIMessage } from "ai";
import { MessageParts } from "./message-parts";

interface VirtualMessagesProps {
  messages: UIMessage[];
  isStreaming: boolean;
}

/**
 * 消息列表虚拟化：只渲染可视区附近的 message，长会话时历史消息的 DOM
 * （含 streamdown 产物）随滚动卸载，避免随会话增长持续累积。
 * 依赖 StickToBottom 的 scrollRef 作为滚动容器，总高度驱动其自动滚到底。
 */
export function VirtualMessages({ messages, isStreaming }: VirtualMessagesProps) {
  const { scrollRef } = useStickToBottomContext();

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => estimateMessageHeight(messages[index]!),
    overscan: 5,
    getItemKey: (index) => messages[index]!.id,
  });

  return (
    <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((item) => (
        <div
          key={item.key}
          ref={virtualizer.measureElement}
          data-index={item.index}
          className="absolute left-0 top-0 w-full"
          style={{ transform: `translateY(${item.start}px)`, paddingBottom: "2rem" }}
        >
          <MessageParts
            message={messages[item.index]!}
            isLastMessage={item.index === messages.length - 1}
            isStreaming={isStreaming}
          />
        </div>
      ))}
    </div>
  );
}

/** 按消息文本量估算高度（虚拟化首帧用），measureElement 随后用真实高度修正 */
function estimateMessageHeight(message: UIMessage): number {
  let chars = 0;
  for (const part of message.parts) {
    if (part.type === "text") chars += (part as { text: string }).text.length;
    else if (typeof part.type === "string" && part.type.startsWith("tool-")) chars += 300;
  }
  return Math.max(72, Math.min(480, 64 + chars * 0.2));
}
