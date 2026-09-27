import type { MastraDBMessage } from "@mastra/core/agent";

/** 提示观察模型输出已截断，避免将残缺内容视为完整事实 */
function truncatedSuffix(toolName: unknown, originalLength: number): string {
  const tool = typeof toolName === "string" ? `「${toolName}」` : "";
  return `\n\n[${tool}工具结果已截断：原 ${originalLength} 字符]`;
}

/** 截断观察模型的工具输入以降低压缩开销，不影响数据库原始消息 */
export function trimLargeToolResults({ maxChars = 4_000 }: { maxChars?: number } = {}) {
  return ({ messages }: { messages: MastraDBMessage[] }): { messages: MastraDBMessage[] } => {
    let trimmed = false;

    const nextMessages = messages.map((message) => {
      const parts = message.content?.parts;
      if (!Array.isArray(parts)) return message;

      let partsChanged = false;
      const nextParts = parts.map((part) => {
        if (part.type !== "tool-invocation") return part;

        const result = part.toolInvocation?.result;
        if (result === undefined) return part;
        const text = typeof result === "string" ? result : JSON.stringify(result);
        if (text.length <= maxChars) return part;

        partsChanged = true;
        return {
          ...part,
          toolInvocation: {
            ...part.toolInvocation,
            result: `${text.slice(0, maxChars)}${truncatedSuffix(part.toolInvocation.toolName, text.length)}`,
          },
        };
      });

      if (!partsChanged) return message;
      trimmed = true;
      return { ...message, content: { ...message.content, parts: nextParts } };
    });

    return { messages: trimmed ? nextMessages : messages };
  };
}
