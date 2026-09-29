export interface ChatUsagePayload {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedTokens: number;
  updatedAt: number;
}

const usageStore = new Map<string, ChatUsagePayload>();

/** 记录指定会话最近一次 LLM 调用真实 Token 消耗与缓存统计 */
export function recordChatUsage(
  threadId: string,
  usage: {
    inputTokens?: number | undefined;
    outputTokens?: number | undefined;
    totalTokens?: number | undefined;
    cachedInputTokens?: number | undefined;
  },
): ChatUsagePayload {
  const promptTokens = usage.inputTokens ?? 0;
  const completionTokens = usage.outputTokens ?? 0;
  const totalTokens = usage.totalTokens ?? promptTokens + completionTokens;
  const cachedTokens = usage.cachedInputTokens ?? 0;

  const payload: ChatUsagePayload = {
    promptTokens,
    completionTokens,
    totalTokens,
    cachedTokens,
    updatedAt: Date.now(),
  };

  usageStore.set(threadId, payload);
  return payload;
}

/** 获取指定会话最近一次调用真实 Token 数据 */
export function getLatestChatUsage(threadId: string): ChatUsagePayload | undefined {
  return usageStore.get(threadId);
}
