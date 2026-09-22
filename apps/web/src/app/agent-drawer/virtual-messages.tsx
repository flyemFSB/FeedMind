import { useVirtualizer } from "@tanstack/react-virtual";
import type { UIMessage } from "ai";
import { MessageParts } from "./message-parts";

interface VirtualMessagesProps {
  messages: UIMessage[];
  isStreaming: boolean;
  /** 滚动容器由 Conversation 提交时回传，拿不到之前虚拟列表无法测量范围 */
  scrollElement: HTMLElement | null;
}

/**
 * 消息列表虚拟化：只渲染可视区附近的 message，长会话时历史消息的 DOM
 * （含 streamdown 产物）随滚动卸载，避免随会话增长持续累积。
 * 滚动容器由调用方注入（StickToBottom 的滚动元素），总高度驱动其自动滚到底。
 *
 * 队尾那条始终不参与虚拟化：它的高度逐帧在变（流式）或刚落地需重排，而虚拟列表测量与吸底滚动两套
 * ResizeObserver 互为输入，同帧内会相互触发（浏览器报 ResizeObserver 循环，
 * 且首次测量为 0 时总高塌陷导致滚动跳动）；它恒在队尾、位置无需测量，交给文档流即可。
 */
export function VirtualMessages({ messages, isStreaming, scrollElement }: VirtualMessagesProps) {
  const tailMessage = messages.at(-1);
  const history = tailMessage ? messages.slice(0, -1) : messages;

  const virtualizer = useVirtualizer({
    count: history.length,
    getScrollElement: () => scrollElement,
    estimateSize: (index) => estimateMessageHeight(history[index]!),
    overscan: 5,
    getItemKey: (index) => history[index]!.id,
  });

  return (
    <>
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
              message={history[item.index]!}
              isLastMessage={false}
              isStreaming={isStreaming}
            />
          </div>
        ))}
      </div>
      {tailMessage && (
        <div className="pb-8">
          <MessageParts message={tailMessage} isLastMessage isStreaming={isStreaming} />
        </div>
      )}
    </>
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
