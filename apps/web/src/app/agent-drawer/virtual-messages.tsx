import { useVirtualizer } from "@tanstack/react-virtual";
import type { UIMessage } from "ai";
import { MessageParts } from "./message-parts";
import type { MessageTelemetry } from "@/app/agent-drawer/chat-utils";

interface VirtualMessagesProps {
  messages: UIMessage[];
  isStreaming: boolean;
  /** 滚动容器由 Conversation 提交时回传，拿不到之前虚拟列表无法测量范围 */
  scrollElement: HTMLElement | null;
  telemetryMap?: Record<string, MessageTelemetry>;
}

// 队尾消息交给文档流自适应排版，仅对历史消息执行虚拟化以避免流式尺寸抖动与测量循环
export function VirtualMessages({
  messages,
  isStreaming,
  scrollElement,
  telemetryMap,
}: VirtualMessagesProps) {
  const tailMessage = messages.at(-1);
  const history = messages.length > 1 ? messages.slice(0, -1) : [];

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
              isStreaming={false}
              telemetry={telemetryMap?.[history[item.index]!.id]}
            />
          </div>
        ))}
      </div>
      {tailMessage && (
        <div className="pb-8">
          <MessageParts
            message={tailMessage}
            isLastMessage
            isStreaming={isStreaming}
            telemetry={telemetryMap?.[tailMessage.id]}
          />
        </div>
      )}
    </>
  );
}

// 按消息文本量估算首帧占位高度，挂载后由 measureElement 修正真实尺寸
function estimateMessageHeight(message: UIMessage): number {
  let chars = 0;
  for (const part of message.parts) {
    if (part.type === "text") chars += (part as { text: string }).text.length;
    else if (typeof part.type === "string" && part.type.startsWith("tool-")) chars += 300;
  }
  return Math.max(72, Math.min(480, 64 + chars * 0.2));
}
