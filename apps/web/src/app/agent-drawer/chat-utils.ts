import type { UIMessage } from "@ai-sdk/react";

const TITLE_MAX_LEN = 15;

/** 按首条消息生成会话标题：折叠空白并截断 */
export function makeChatTitle(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "新会话";
  return clean.length > TITLE_MAX_LEN ? `${clean.slice(0, TITLE_MAX_LEN)}…` : clean;
}

/** 分页加载：新一页消息拼接在更早消息之前（page=0 为最新一页，递增向前翻） */
export function prependOlderPage(older: UIMessage[], page: UIMessage[]): UIMessage[] {
  return [...page, ...older];
}
