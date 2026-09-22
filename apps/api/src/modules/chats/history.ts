import type { toAISdkV5Messages } from "@mastra/ai-sdk/ui";

type UIMessage = ReturnType<typeof toAISdkV5Messages>[number];

/** 合并同一回合中多条助手消息的 parts，保持历史视图与流式聚合效果一致 */
export function mergeAssistantTurns(messages: UIMessage[]): UIMessage[] {
  const merged: UIMessage[] = [];
  for (const message of messages) {
    const previous = merged[merged.length - 1];
    if (message.role === "assistant" && previous?.role === "assistant") {
      previous.parts.push(...message.parts);
      continue;
    }
    // 浅拷贝 parts 数组，避免修改原始引用
    merged.push({ ...message, parts: [...message.parts] });
  }
  return merged;
}
